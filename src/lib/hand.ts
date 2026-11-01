import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { DetectorClient } from '../vision/detectorClient';
import { measureHandScale, ProximityTracker, type HandGesture } from '../vision/gestures';
import { handWidth, HandIntentTracker, isPointing, type HandIntent } from '../vision/handIntent';

export type { HandGesture };

export type HandState = {
  x:          number;
  y:          number;
  touching:   boolean;   // true = TOUCHING_GLASS, finger is erasing fog
  visible:    boolean;
  handScale:  number;    // current raw apparent hand size
  proximity:  number;    // smoothed ratio vs calibrated size
  state:      'HOVER' | 'TOUCHING_GLASS';
  intent:     HandIntent;
  wiping:     boolean;
  wipeRadius: number;   // screen-height UV units
};

// ---------------------------------------------------------------------------
// Calibration
//   Phase 1 ("show me your hand.")  — collect samples for ~1 s
//   Phase 2 ("come closer.")        — calibration complete, tracking live
// ---------------------------------------------------------------------------
export type CalibrationPhase = 'waiting' | 'sampling' | 'done';

const clamp = (n: number) => Math.min(1, Math.max(0, n));

const CALIBRATION_DURATION_MS = 1000;
const CALIBRATION_MIN_SAMPLES = 8;

export class HandTracker {
  private landmarker: DetectorClient<NormalizedLandmark[][]>;
  private video: HTMLVideoElement;
  private lastSeen      = 0;
  private lastTime      = 0;
  private proximity     = new ProximityTracker();
  private intentTracker  = new HandIntentTracker();
  private proximityPen   = false;
  private drawingHeld    = false;
  private releasedFrames = 0;
  private targetX = 0;
  private targetY = 0;
  private latest: HandState | null = null;
  private smoothX       = 0;
  private smoothY       = 0;
  private hadPosition   = false;
  private onLandmarks?: (landmarks: NormalizedLandmark[] | null, video: HTMLVideoElement) => void;
  private onCalibrationPhase?: (phase: CalibrationPhase) => void;

  calibrationPhase: CalibrationPhase = 'waiting';
  private calibSamples: number[]     = [];
  private calibStartAt               = 0;

  private constructor(
    landmarker: DetectorClient<NormalizedLandmark[][]>,
    video: HTMLVideoElement,
    onLandmarks?: (landmarks: NormalizedLandmark[] | null, video: HTMLVideoElement) => void,
    onCalibrationPhase?: (phase: CalibrationPhase) => void,
  ) {
    this.landmarker         = landmarker;
    this.video              = video;
    this.onLandmarks        = onLandmarks;
    this.onCalibrationPhase = onCalibrationPhase;
  }

  static async create(
    video: HTMLVideoElement,
    onLandmarks?: (landmarks: NormalizedLandmark[] | null, video: HTMLVideoElement) => void,
    onCalibrationPhase?: (phase: CalibrationPhase) => void,
    signal?: AbortSignal,
  ) {
    const landmarker = await DetectorClient.create<NormalizedLandmark[][]>('hand', signal);
    return new HandTracker(landmarker, video, onLandmarks, onCalibrationPhase);
  }

  update(now: number): HandState | null {
    if (this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || this.video.videoWidth === 0) return null;
    const hands = this.landmarker.update(this.video, now, 50);
    if (hands === undefined) {
      if (now - this.lastSeen > 250) {
        this.lose();
        return this.missingState();
      }
      return this.interpolate(now);
    }
    const landmarks = hands[0];
    this.onLandmarks?.(landmarks ?? null, this.video);

    if (!landmarks) {
      if (now - this.lastSeen > 250) {
        this.lose();
        return this.missingState();
      }
      return null;
    }
    this.lastSeen = now;

    const handScale = measureHandScale(landmarks);

    // calibration
    if (this.calibrationPhase === 'waiting') {
      this.calibrationPhase = 'sampling';
      this.calibSamples     = [];
      this.calibStartAt     = now;
      this.onCalibrationPhase?.('sampling');
    }
    if (this.calibrationPhase === 'sampling') {
      this.calibSamples.push(handScale);
      if (now - this.calibStartAt >= CALIBRATION_DURATION_MS && this.calibSamples.length >= CALIBRATION_MIN_SAMPLES) {
        const avg = this.calibSamples.reduce((a, b) => a + b, 0) / this.calibSamples.length;
        this.proximity.calibrate(avg);
        this.calibrationPhase = 'done';
        this.onCalibrationPhase?.('done');
      }
    }

    const touchState = this.calibrationPhase === 'done'
      ? this.proximity.update(handScale, now)
      : 'HOVER';

    // fingertip viewport mapping (object-fit: cover + mirror)
    const tip    = landmarks[8];
    const bounds = this.video.parentElement?.getBoundingClientRect();
    const width  = bounds?.width  || window.innerWidth;
    const height = bounds?.height || window.innerHeight;
    const scale  = Math.max(width / this.video.videoWidth, height / this.video.videoHeight);
    const displayedWidth  = this.video.videoWidth  * scale;
    const displayedHeight = this.video.videoHeight * scale;
    const offsetX = (width  - displayedWidth)  / 2;
    const offsetY = (height - displayedHeight) / 2;
    const mappedX = (width - (offsetX + tip.x * displayedWidth))  / width;
    const mappedY =          (offsetY + tip.y * displayedHeight)   / height;
    const inside  = mappedX >= 0 && mappedX <= 1 && mappedY >= 0 && mappedY <= 1;

    if (!inside) {
      this.lose();
      return this.missingState();
    }

    const x  = clamp(mappedX);
    const y  = clamp(mappedY);
    this.targetX = x;
    this.targetY = y;
    if (!this.hadPosition) {
      this.smoothX = x;
      this.smoothY = y;
      this.hadPosition = true;
      this.lastTime = now;
    }
    const intent = this.intentTracker.update(landmarks);
    this.proximityPen = intent !== 'WIPE' && touchState === 'TOUCHING_GLASS' && isPointing(landmarks);
    if (intent === 'WIPE') {
      this.drawingHeld = false;
      this.releasedFrames = 0;
    } else if (intent === 'DRAW' || this.proximityPen) {
      this.drawingHeld = true;
      this.releasedFrames = 0;
    } else if (++this.releasedFrames >= 2) {
      this.drawingHeld = false;
    }
    const wipeRadius = handWidth(landmarks, this.video.videoWidth / this.video.videoHeight)
      * displayedHeight / height * 1.6;

    this.latest = {
      x:         this.smoothX,
      y:         this.smoothY,
      touching:  this.drawingHeld,
      visible:   inside,
      handScale,
      proximity: this.proximity.proximity,
      state:     this.drawingHeld || intent === 'WIPE' ? 'TOUCHING_GLASS' : 'HOVER',
      intent,
      wiping:   intent === 'WIPE',
      wipeRadius,
    };
    return this.interpolate(now);
  }

  private interpolate(now: number): HandState | null {
    if (!this.latest) return null;
    const dt = Math.max(0, Math.min(100, now - this.lastTime));
    this.lastTime = now;
    // Follow new inference positions every display frame, without prediction.
    const alpha = 1 - Math.exp(-dt / 35);
    this.smoothX += (this.targetX - this.smoothX) * alpha;
    this.smoothY += (this.targetY - this.smoothY) * alpha;
    this.latest.x = this.smoothX;
    this.latest.y = this.smoothY;
    return this.latest;
  }

  private missingState(): HandState {
    return { x: this.smoothX, y: this.smoothY, touching: false, visible: false,
      handScale: 0, proximity: this.proximity.proximity, state: 'HOVER',
      intent: 'IDLE', wiping: false, wipeRadius: 0 };
  }

  private lose() {
    this.latest = null;
    this.intentTracker.reset();
    this.proximity.release();
    this.proximityPen = false;
    this.drawingHeld = false;
    this.releasedFrames = 0;
    if (this.calibrationPhase !== 'done') {
      this.calibrationPhase = 'waiting';
      this.calibSamples = [];
      this.calibStartAt = 0;
    }
    this.hadPosition      = false;
    this.lastTime         = 0;
  }

  close() { this.landmarker.close(); }
}
