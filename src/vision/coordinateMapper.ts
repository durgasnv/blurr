export type ViewportPoint = { x: number; y: number };
export type GlassUv = { x: number; y: number };

// HandTracker coordinates start at the top-left. WebGL UVs start at the bottom-left.
export function viewportToGlassUv(point: ViewportPoint): GlassUv {
  return { x: point.x, y: 1 - point.y };
}
