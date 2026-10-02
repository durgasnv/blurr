export type Quality = 'high' | 'medium' | 'low';

export type QualitySettings = {
  level: Quality;
  pixelRatio: number;
  maskScale: number;
  frameInterval: number;
  maxDrops: number;
  shaderLevel: number;
};

export function chooseQuality(width: number, height: number, devicePixelRatio: number, cores: number): QualitySettings {
  const pixels = width * height * Math.min(devicePixelRatio, 2) ** 2;
  if (cores <= 4 || pixels > 6_000_000) {
    return { level: 'low', pixelRatio: 1, maskScale: 0.3, frameInterval: 33, maxDrops: 4, shaderLevel: 0 };
  }
  if (cores < 8 || pixels > 3_000_000) {
    return { level: 'medium', pixelRatio: 1.35, maskScale: 0.4, frameInterval: 23, maxDrops: 8, shaderLevel: 1 };
  }
  return { level: 'high', pixelRatio: 1.7, maskScale: 0.5, frameInterval: 16, maxDrops: 12, shaderLevel: 2 };
}
