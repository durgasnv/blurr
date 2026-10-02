import { FilesetResolver, HandLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision';
import { classifyGesture, GestureStabilizer, type HandGesture } from '../vision/gestures';

export type HandState = { x: number; y: number; drawing: boolean; visible: boolean; gesture: HandGesture };

const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const clamp = (n: number) => Math.min(1, Math.max(0, n));
export class HandTracker {
  private landmarker: HandLandmarker;
  private video: HTMLVideoElement;
  private lastVideoTime = -1;
  private lastSeen = 0;
  private lastTime = 0;
  private gestures = new GestureStabilizer();
  private smoothX = 0;
  private smoothY = 0;
  private hadPosition = false;
  private onLandmarks?: (landmarks: NormalizedLandmark[] | null, video: HTMLVideoElement) => void;

  private constructor(landmarker: HandLandmarker, video: HTMLVideoElement, onLandmarks?: (landmarks: NormalizedLandmark[] | null, video: HTMLVideoElement) => void) {
    this.landmarker = landmarker;
    this.video = video;
    this.onLandmarks = onLandmarks;
  }

  static async create(video: HTMLVideoElement, onLandmarks?: (landmarks: NormalizedLandmark[] | null, video: HTMLVideoElement) => void) {
    const vision = await FilesetResolver.forVisionTasks(WASM);
    let landmarker: HandLandmarker;
    const options = {
      baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' as const },
      runningMode: 'VIDEO' as const,
      numHands: 1,
      minHandDetectionConfidence: 0.65,
      minHandPresenceConfidence: 0.55,
      minTrackingConfidence: 0.55,
    };
    try {
      landmarker = await HandLandmarker.createFromOptions(vision, options);
    } catch {
      landmarker = await HandLandmarker.createFromOptions(vision, {
        ...options,
        baseOptions: { modelAssetPath: MODEL, delegate: 'CPU' },
      });
    }
    return new HandTracker(landmarker, video, onLandmarks);
  }

  update(now: number): HandState | null {
    if (this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || this.video.videoWidth === 0) return null;
    if (this.video.currentTime === this.lastVideoTime) {
      if (now - this.lastSeen > 180) {
        this.lose();
        return { x: this.smoothX, y: this.smoothY, drawing: false, visible: false, gesture: 'IDLE' };
      }
      return null;
    }
    this.lastVideoTime = this.video.currentTime;
    const hands = this.landmarker.detectForVideo(this.video, now).landmarks;
    const landmarks = hands[0];
    this.onLandmarks?.(landmarks ?? null, this.video);
    if (!landmarks) {
      if (now - this.lastSeen > 180) this.lose();
      return { x: this.smoothX, y: this.smoothY, drawing: false, visible: false, gesture: 'IDLE' };
    }
    this.lastSeen = now;

    const gesture = classifyGesture(landmarks);
    const drawing = this.gestures.update(gesture);

    const tip = landmarks[8];
    const bounds = this.video.parentElement?.getBoundingClientRect();
    const width = bounds?.width || window.innerWidth;
    const height = bounds?.height || window.innerHeight;
    // Match CSS object-fit: cover before mirroring. This keeps the wipe aligned
    // with the visible finger even when the camera is cropped on a wide or tall screen.
    const scale = Math.max(width / this.video.videoWidth, height / this.video.videoHeight);
    const displayedWidth = this.video.videoWidth * scale;
    const displayedHeight = this.video.videoHeight * scale;
    const offsetX = (width - displayedWidth) / 2;
    const offsetY = (height - displayedHeight) / 2;
    const mappedX = (width - (offsetX + tip.x * displayedWidth)) / width;
    const mappedY = (offsetY + tip.y * displayedHeight) / height;
    const inside = mappedX >= 0 && mappedX <= 1 && mappedY >= 0 && mappedY <= 1;
    if (!inside) {
      this.lose();
      return { x: this.smoothX, y: this.smoothY, drawing: false, visible: false, gesture: 'IDLE' };
    }
    const x = clamp(mappedX);
    const y = clamp(mappedY);
    const dt = this.lastTime ? Math.min(50, now - this.lastTime) : 16;
    const alpha = 1 - Math.exp(-dt / 42);
    if (!this.hadPosition) { this.smoothX = x; this.smoothY = y; this.hadPosition = true; }
    else {
      this.smoothX += (x - this.smoothX) * alpha;
      this.smoothY += (y - this.smoothY) * alpha;
    }
    this.lastTime = now;
    return { x: this.smoothX, y: this.smoothY, drawing: drawing && inside, visible: inside, gesture };
  }

  private lose() {
    this.gestures.reset();
    this.hadPosition = false;
    this.lastTime = 0;
  }

  close() { this.landmarker.close(); }
}
