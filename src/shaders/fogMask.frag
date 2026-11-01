uniform sampler2D uPrevious;
uniform float uQuantize;
uniform float uStepSeed;
uniform float uGrowth;
uniform float uBlowRadius;
uniform vec2 uBlowCenter;
uniform float uBlowSeed;
uniform float uWetDecay;
uniform float uRegeneration;
uniform float uRestoreAll;
uniform vec2 uTexel;
uniform vec2 uEraseFrom;
uniform vec2 uEraseTo;
uniform float uEraseRadius;
uniform float uEraseStrength;
uniform float uAspect;
varying vec2 vUv;

void main() {
  vec4 previous = texture2D(uPrevious, vUv);
  float fog = previous.r;
  float wet = max(0.0, previous.g - uWetDecay);
  float memory = previous.b;
  if (uRestoreAll > 0.5) {
    fog = memory;
    wet = 0.0;
  }
  if (uGrowth > 0.0) {
    // A continuous breath footprint deposits moisture on a fixed surface.
    // Broad coverage and a soft perimeter avoid individual smoke-like puffs.
    vec2 delta = (vUv - uBlowCenter) * vec2(uAspect / 1.45, 1.0);
    float footprint = 1.0 - smoothstep(uBlowRadius * 0.35, uBlowRadius, length(delta));
    float coverage = mix(0.96, 1.04, valueNoise(vUv * vec2(uAspect, 1.0) * 140.0));
    fog = clamp(fog + uGrowth * footprint * coverage * 1.8, 0.0, 1.0);
  }
  memory = max(memory, fog);
  if (uRegeneration > 0.0) {
    float neighbors = (
      texture2D(uPrevious, vUv + vec2(uTexel.x, 0.0)).r
      + texture2D(uPrevious, vUv - vec2(uTexel.x, 0.0)).r
      + texture2D(uPrevious, vUv + vec2(0.0, uTexel.y)).r
      + texture2D(uPrevious, vUv - vec2(0.0, uTexel.y)).r
    ) * 0.25;
    fog = mix(fog, neighbors, min(0.08, uRegeneration * 4.0));
    float variation = mix(0.65, 1.45, valueNoise(vUv * 11.0 + vec2(2.6, 9.4)));
    fog = min(memory, fog + uRegeneration * variation * memory);
  }
  vec2 point = vUv * vec2(uAspect, 1.0);
  vec2 start = uEraseFrom * vec2(uAspect, 1.0);
  vec2 end = uEraseTo * vec2(uAspect, 1.0);
  vec2 segment = end - start;
  float along = clamp(dot(point - start, segment) / max(dot(segment, segment), 0.000001), 0.0, 1.0);
  float distanceToStroke = length(point - (start + along * segment));
  float wipe = 1.0 - smoothstep(uEraseRadius * 0.48, uEraseRadius, distanceToStroke);
  fog = max(0.0, fog - wipe * uEraseStrength);
  float rim = smoothstep(uEraseRadius * 0.64, uEraseRadius * 0.93, distanceToStroke)
    * (1.0 - smoothstep(uEraseRadius * 0.94, uEraseRadius * 1.42, distanceToStroke));
  wet = max(wet, rim * uEraseStrength * 0.72);
  vec3 state = clamp(vec3(fog, wet, memory), 0.0, 1.0);
  if (uQuantize > 0.5) {
    // Unbiased rounding lets sub-byte growth, decay and refill accumulate.
    float threshold = hash21(gl_FragCoord.xy + vec2(uStepSeed * 13.7, uStepSeed * 3.1));
    state = floor(state * 255.0 + threshold) / 255.0;
  }
  gl_FragColor = vec4(state, 1.0);
}
