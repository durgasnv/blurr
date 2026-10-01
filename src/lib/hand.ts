import { FilesetResolver, HandLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision';

export type HandState = { x: number; y: number; drawing: boolean; visible: boolean };

const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const clamp = (n: number) => Math.min(1, Math.max(0, n));
const distance = (a: NormalizedLandmark, b: NormalizedLandmark) => Math.hypot(a.x - b.x, a.y - b.y);

function indexOnly(landmarks: NormalizedLandmark[]) {
  const wrist = landmarks[0];
  const palm = distance(wrist, landmarks[9]);
  if (palm < 0.035) return false;
  const extended = (tip: number, pip: number) =>
    distance(landmarks[tip], wrist) > distance(landmarks[pip], wrist) + palm * 0.12;
  const index = extended(8, 6);
  const otherExtended = [extended(12, 10), extended(16, 14), extended(20, 18)];
  return index && otherExtended.filter(Boolean).length === 0;
}

export class HandTracker {
  private landmarker: HandLandmarker;
  private video: HTMLVideoElement;
  private lastVideoTime = -1;
  private lastSeen = 0;
  private lastTime = 0;
  private stableDraw = false;
  private candidateDraw = false;
  private candidateFrames = 0;
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
        return { x: this.smoothX, y: this.smoothY, drawing: false, visible: false };
      }
      return null;
    }
    this.lastVideoTime = this.video.currentTime;
    const hands = this.landmarker.detectForVideo(this.video, now).landmarks;
    const landmarks = hands[0];
    this.onLandmarks?.(landmarks ?? null, this.video);
    if (!landmarks) {
      if (now - this.lastSeen > 180) this.lose();
      return { x: this.smoothX, y: this.smoothY, drawing: false, visible: false };
    }
    this.lastSeen = now;

    const rawDraw = indexOnly(landmarks);
    if (rawDraw === this.candidateDraw) this.candidateFrames++;
    else { this.candidateDraw = rawDraw; this.candidateFrames = 1; }
    if (this.candidateFrames >= (rawDraw ? 3 : 2)) this.stableDraw = rawDraw;

    const tip = landmarks[8];
    const x = clamp(1 - tip.x); // Front-facing camera is mirrored for direct manipulation.
    const y = clamp(tip.y);
    const dt = this.lastTime ? Math.min(50, now - this.lastTime) : 16;
    const alpha = 1 - Math.exp(-dt / 42);
    if (!this.hadPosition) { this.smoothX = x; this.smoothY = y; this.hadPosition = true; }
    else {
      this.smoothX += (x - this.smoothX) * alpha;
      this.smoothY += (y - this.smoothY) * alpha;
    }
    this.lastTime = now;
    return { x: this.smoothX, y: this.smoothY, drawing: this.stableDraw, visible: true };
  }

  private lose() {
    this.stableDraw = false;
    this.candidateFrames = 0;
    this.hadPosition = false;
    this.lastTime = 0;
  }

  close() { this.landmarker.close(); }
}
