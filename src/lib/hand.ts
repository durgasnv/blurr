import { FilesetResolver, HandLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision';
import { measureHandScale, ProximityTracker, type HandGesture } from '../vision/gestures';

export type { HandGesture };

export type HandState = {
  x:          number;
  y:          number;
  touching:   boolean;   // true = TOUCHING_GLASS, finger is erasing fog
  visible:    boolean;
  handScale:  number;    // current raw apparent hand size
  proximity:  number;    // smoothed ratio vs calibrated size
  state:      'HOVER' | 'TOUCHING_GLASS';
};

// ---------------------------------------------------------------------------
// Calibration
//   Phase 1 ("show me your hand.")  — collect samples for ~1 s
//   Phase 2 ("come closer.")        — calibration complete, tracking live
// ---------------------------------------------------------------------------
export type CalibrationPhase = 'waiting' | 'sampling' | 'done';

const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const WASM  = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const clamp = (n: number) => Math.min(1, Math.max(0, n));

const CALIBRATION_DURATION_MS = 1000;
const CALIBRATION_MIN_SAMPLES = 8;

export class HandTracker {
  private landmarker: HandLandmarker;
  private video: HTMLVideoElement;
  private lastVideoTime = -1;
  private lastSeen      = 0;
  private lastTime      = 0;
  private proximity     = new ProximityTracker();
  private smoothX       = 0;
  private smoothY       = 0;
  private hadPosition   = false;
  private onLandmarks?: (landmarks: NormalizedLandmark[] | null, video: HTMLVideoElement) => void;
  private onCalibrationPhase?: (phase: CalibrationPhase) => void;

  calibrationPhase: CalibrationPhase = 'waiting';
  private calibSamples: number[]     = [];
  private calibStartAt               = 0;

  private constructor(
    landmarker: HandLandmarker,
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
  ) {
    const vision = await FilesetResolver.forVisionTasks(WASM);
    let landmarker: HandLandmarker;
    const options = {
      baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' as const },
      runningMode: 'VIDEO' as const,
      numHands: 1,
      minHandDetectionConfidence: 0.55,
      minHandPresenceConfidence: 0.50,
      minTrackingConfidence: 0.50,
    };
    try {
      landmarker = await HandLandmarker.createFromOptions(vision, options);
    } catch {
      landmarker = await HandLandmarker.createFromOptions(vision, {
        ...options,
        baseOptions: { modelAssetPath: MODEL, delegate: 'CPU' },
      });
    }
    return new HandTracker(landmarker, video, onLandmarks, onCalibrationPhase);
  }

  update(now: number): HandState | null {
    if (this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || this.video.videoWidth === 0) return null;
    if (this.video.currentTime === this.lastVideoTime) {
      if (now - this.lastSeen > 180) {
        this.lose();
        return { x: this.smoothX, y: this.smoothY, touching: false, visible: false, handScale: 0, proximity: this.proximity.proximity, state: 'HOVER' };
      }
      return null;
    }
    this.lastVideoTime = this.video.currentTime;

    const hands     = this.landmarker.detectForVideo(this.video, now).landmarks;
    const landmarks = hands[0];
    this.onLandmarks?.(landmarks ?? null, this.video);

    if (!landmarks) {
      if (now - this.lastSeen > 180) this.lose();
      return { x: this.smoothX, y: this.smoothY, touching: false, visible: false, handScale: 0, proximity: this.proximity.proximity, state: 'HOVER' };
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
      return { x: this.smoothX, y: this.smoothY, touching: false, visible: false, handScale, proximity: this.proximity.proximity, state: 'HOVER' };
    }

    const x  = clamp(mappedX);
    const y  = clamp(mappedY);
    const dt = this.lastTime ? Math.min(50, now - this.lastTime) : 16;
    const alpha = 1 - Math.exp(-dt / 42);
    if (!this.hadPosition) {
      this.smoothX = x;
      this.smoothY = y;
      this.hadPosition = true;
    } else {
      this.smoothX += (x - this.smoothX) * alpha;
      this.smoothY += (y - this.smoothY) * alpha;
    }
    this.lastTime = now;

    return {
      x:         this.smoothX,
      y:         this.smoothY,
      touching:  touchState === 'TOUCHING_GLASS' && inside,
      visible:   inside,
      handScale,
      proximity: this.proximity.proximity,
      state:     touchState,
    };
  }

  private lose() {
    this.proximity.reset();
    this.calibrationPhase = 'waiting';
    this.calibSamples     = [];
    this.hadPosition      = false;
    this.lastTime         = 0;
  }

  close() { this.landmarker.close(); }
}
