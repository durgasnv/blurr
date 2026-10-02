import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

export type HandGesture = 'HOVER' | 'TOUCHING_GLASS' | 'NO_HAND';

// ---------------------------------------------------------------------------
// Hand scale — apparent size of the hand in normalised image space.
// We use the distance between the index-finger MCP (landmark 5) and the
// pinky MCP (landmark 17) as a stable, rotation-tolerant proxy for how
// close the hand is to the camera.
// ---------------------------------------------------------------------------
export function measureHandScale(landmarks: NormalizedLandmark[]): number {
  const indexMcp = landmarks[5];
  const pinkyMcp = landmarks[17];
  return Math.hypot(indexMcp.x - pinkyMcp.x, indexMcp.y - pinkyMcp.y);
}

// ---------------------------------------------------------------------------
// ProximityTracker
//
// Maintains:
//   calibratedScale  — resting hand size measured during calibration
//   proximity        — smoothed ratio of currentScale / calibratedScale
//   state            — HOVER | TOUCHING_GLASS  (with hysteresis)
//
// Hysteresis thresholds (relative to calibrated scale):
//   TOUCH_ENTER  1.28  — must reach this to enter TOUCHING_GLASS
//   TOUCH_EXIT   1.16  — must fall below this to leave TOUCHING_GLASS
// ---------------------------------------------------------------------------
const TOUCH_ENTER = 1.28;
const TOUCH_EXIT  = 1.16;
const SMOOTH_TAU  = 60;   // ms  — EMA time constant for proximity

export class ProximityTracker {
  calibratedScale = 0;
  proximity       = 1;
  state: 'HOVER' | 'TOUCHING_GLASS' = 'HOVER';
  private lastTime = 0;

  calibrate(scale: number) {
    this.calibratedScale = scale;
    this.proximity = 1;
    this.state = 'HOVER';
  }

  update(scale: number, now: number): 'HOVER' | 'TOUCHING_GLASS' {
    if (!this.calibratedScale) return 'HOVER';
    const dt    = this.lastTime ? Math.min(100, now - this.lastTime) : 16;
    this.lastTime = now;
    const alpha   = 1 - Math.exp(-dt / SMOOTH_TAU);
    const raw     = scale / this.calibratedScale;
    this.proximity += (raw - this.proximity) * alpha;

    if (this.state === 'HOVER' && this.proximity >= TOUCH_ENTER) {
      this.state = 'TOUCHING_GLASS';
    } else if (this.state === 'TOUCHING_GLASS' && this.proximity < TOUCH_EXIT) {
      this.state = 'HOVER';
    }
    return this.state;
  }

  reset() {
    this.calibratedScale = 0;
    this.proximity       = 1;
    this.state           = 'HOVER';
    this.lastTime        = 0;
  }
}
