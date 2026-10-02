import type { ViewportPoint } from '../vision/coordinateMapper';

/** Place stamps by distance, with a guard against camera reacquisition jumps. */
export function forEachStamp(
  from: ViewportPoint,
  to: ViewportPoint,
  radiusPx: number,
  width: number,
  height: number,
  stamp: (x: number, y: number) => void,
) {
  const dx = (to.x - from.x) * width;
  const dy = (to.y - from.y) * height;
  const distance = Math.hypot(dx, dy);
  const count = distance > width * 0.3
    ? 1
    : Math.min(40, Math.max(1, Math.ceil(distance / Math.max(1, radiusPx * 0.5))));
  for (let i = 1; i <= count; i++) {
    const t = i / count;
    stamp(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
  }
}
