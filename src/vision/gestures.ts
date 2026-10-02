import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

export type HandGesture = 'DRAW' | 'OPEN_PALM' | 'FIST' | 'IDLE';

const distance = (a: NormalizedLandmark, b: NormalizedLandmark) => Math.hypot(a.x - b.x, a.y - b.y);

export function classifyGesture(landmarks: NormalizedLandmark[]): HandGesture {
  const wrist = landmarks[0];
  const palm = distance(wrist, landmarks[9]);
  if (palm < 0.035) return 'IDLE';
  const extended = (tip: number, pip: number) =>
    distance(landmarks[tip], wrist) > distance(landmarks[pip], wrist) + palm * 0.12;
  const fingers = [extended(8, 6), extended(12, 10), extended(16, 14), extended(20, 18)];
  if (fingers[0] && fingers.slice(1).every(value => !value)) return 'DRAW';
  if (fingers.every(Boolean)) return 'OPEN_PALM';
  if (fingers.every(value => !value)) return 'FIST';
  return 'IDLE';
}

export class GestureStabilizer {
  private candidateDraw = false;
  private candidateFrames = 0;
  private stableDraw = false;

  update(gesture: HandGesture) {
    const drawing = gesture === 'DRAW';
    if (drawing === this.candidateDraw) this.candidateFrames++;
    else {
      this.candidateDraw = drawing;
      this.candidateFrames = 1;
    }
    if (this.candidateFrames >= (drawing ? 3 : 2)) this.stableDraw = drawing;
    return this.stableDraw;
  }

  reset() {
    this.candidateDraw = false;
    this.candidateFrames = 0;
    this.stableDraw = false;
  }
}
