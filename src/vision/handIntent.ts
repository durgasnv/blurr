import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

export type HandIntent = 'IDLE' | 'DRAW' | 'WIPE';

const distance = (a: NormalizedLandmark, b: NormalizedLandmark) => Math.hypot(a.x - b.x, a.y - b.y);

export function handWidth(landmarks: NormalizedLandmark[], videoAspect: number): number {
  const pixelShapeDistance = (a: NormalizedLandmark, b: NormalizedLandmark) =>
    Math.hypot((a.x - b.x) * videoAspect, a.y - b.y);
  return Math.max(
    pixelShapeDistance(landmarks[5], landmarks[17]),
    pixelShapeDistance(landmarks[0], landmarks[9]),
  );
}

export function isFist(landmarks: NormalizedLandmark[]): boolean {
  const wrist = landmarks[0];
  return [[8, 6], [12, 10], [16, 14], [20, 18]].every(([tip, middle]) =>
    distance(landmarks[tip], wrist) < distance(landmarks[middle], wrist),
  );
}

export function isIndexExtended(landmarks: NormalizedLandmark[]): boolean {
  return distance(landmarks[8], landmarks[0]) > distance(landmarks[6], landmarks[0]);
}

/** Proximity drawing needs an index-only pose. */
export function isPointing(landmarks: NormalizedLandmark[]): boolean {
  return isIndexExtended(landmarks) && [[12, 10], [16, 14], [20, 18]].every(([tip, middle]) =>
    distance(landmarks[tip], landmarks[0]) <= distance(landmarks[middle], landmarks[0]) * 1.08,
  );
}

export function isOpenPalm(landmarks: NormalizedLandmark[]): boolean {
  const wrist = landmarks[0];
  // Require all four fingers to be clearly extended and a spread thumb.
  // A pointing finger or a brief tracking error must never clear the screen.
  const extended = [[8, 6], [12, 10], [16, 14], [20, 18]].every(([tip, middle]) =>
    distance(landmarks[tip], wrist) > distance(landmarks[middle], wrist) * 1.18,
  );
  const width = Math.max(.001, distance(landmarks[5], landmarks[17]));
  return extended && distance(landmarks[4], landmarks[5]) > width * .45
    && distance(landmarks[8], landmarks[20]) > width * .8;
}

export class HandIntentTracker {
  private drawing = false;
  private releaseFrames = 0;
  private palmFrames = 0;

  update(landmarks: NormalizedLandmark[]): HandIntent {
    if (isOpenPalm(landmarks)) {
      this.palmFrames++;
      this.drawing = false;
      this.releaseFrames = 0;
      return this.palmFrames >= 5 ? 'WIPE' : 'IDLE';
    }
    this.palmFrames = 0;
    if (isFist(landmarks)) {
      this.drawing = false;
      this.releaseFrames = 0;
      return 'IDLE';
    }

    const wrist = landmarks[0];
    const indexExtended = isIndexExtended(landmarks);
    const handLength = Math.max(0.001, distance(wrist, landmarks[9]));
    const pinch = distance(landmarks[4], landmarks[8]) / handLength;

    if (this.drawing) {
      this.releaseFrames = pinch > 0.38 ? this.releaseFrames + 1 : 0;
      if (this.releaseFrames >= 2) this.drawing = false;
    } else if (indexExtended && pinch < 0.22) {
      this.drawing = true;
      this.releaseFrames = 0;
    }
    return this.drawing ? 'DRAW' : 'IDLE';
  }

  reset() {
    this.drawing = false;
    this.releaseFrames = 0;
    this.palmFrames = 0;
  }
}
