uniform sampler2D uFogMask;
uniform sampler2D uCamera;
uniform sampler2D uDiffusedCamera;
uniform float uHasCamera;
uniform vec2 uVideoCrop;
uniform float uTime;
uniform vec2 uFinger;
uniform float uDebugFinger;
uniform float uAspect;
uniform vec3 uDrops[12];
uniform int uDropCount;
uniform float uQuality;
varying vec2 vUv;

vec3 sampleBackground(vec2 uv) {
  if (uHasCamera < 0.5) return atmosphericRoom(uv);
  vec2 cameraUv = (vec2(1.0 - uv.x, uv.y) - 0.5) * uVideoCrop + 0.5;
  return texture2D(uCamera, clamp(cameraUv, 0.0, 1.0)).rgb;
}

void main() {
  vec2 surface = vUv * vec2(uAspect, 1.0);
  float fine = valueNoise(surface * 140.0);
  float grain = hash21(gl_FragCoord.xy);
  vec4 moisture = texture2D(uFogMask, vUv);
  // Condensation adheres to the glass: only fine, stationary thickness variation.
  float fog = clamp(moisture.r * (0.98 + fine * 0.04), 0.0, 1.0);
  float wet = moisture.g;
  vec2 texel = vec2(0.0015 / uAspect, 0.0015);
  vec2 wetSlope = vec2(
    texture2D(uFogMask, vUv + vec2(texel.x, 0.0)).g - texture2D(uFogMask, vUv - vec2(texel.x, 0.0)).g,
    texture2D(uFogMask, vUv + vec2(0.0, texel.y)).g - texture2D(uFogMask, vUv - vec2(0.0, texel.y)).g
  );
  // Only mature, heavily condensed glass carries occasional visible drops.
  vec2 dropNormal = vec2(0.0);
  float dropRim = 0.0;
  float dropVisibility = smoothstep(0.72, 0.98, fog);
  for (int i = 0; i < 12; i++) {
    if (i >= uDropCount) break;
    vec2 delta = (vUv - uDrops[i].xy) * vec2(uAspect, 1.0);
    float radius = uDrops[i].z;
    float distanceToDrop = length(delta);
    float lens = 1.0 - smoothstep(radius * 0.2, radius, distanceToDrop);
    float edge = smoothstep(radius * 0.75, radius * 0.92, distanceToDrop)
      * (1.0 - smoothstep(radius * 0.92, radius * 1.08, distanceToDrop));
    dropNormal += vec2(delta.x / uAspect, delta.y) / max(distanceToDrop, 0.001)
      * lens * radius * 0.12 * dropVisibility;
    dropRim += edge * dropVisibility;
  }
  vec2 displaced = clamp(vUv + wetSlope * 0.002 + dropNormal, 0.0, 1.0);
  vec3 sharp = sampleBackground(displaced);
  vec3 diffused = uHasCamera > 0.5
    ? texture2D(uDiffusedCamera, displaced).rgb : atmosphericRoom(displaced);
  // Optical thickness progressively removes detail and lifts the dark reflection.
  float diffusion = 1.0 - exp(-fog * 5.5);
  vec3 frost = diffused;
  float scattering = (1.0 - exp(-fog * 2.0)) * 0.48;
  frost = mix(frost, vec3(232.0, 237.0, 235.0) / 255.0, scattering);
  vec3 color = mix(sharp, frost, diffusion);
  color *= 1.0 - wet * 0.045;
  color += max(0.0, wetSlope.y) * 0.018;
  color += clamp(dropRim, 0.0, 1.0) * 0.012;
  // Tiny fixed moisture highlights give the coating a surface at close range.
  float microBead = smoothstep(0.88, 0.99, fine);
  color += (microBead * 0.012 + (grain - 0.5) * 0.009) * fog;
  if (uDebugFinger > 0.5 && uFinger.x >= 0.0) {
    vec2 distanceFromFinger = (vUv - uFinger) * vec2(uAspect, 1.0);
    float marker = 1.0 - smoothstep(0.008, 0.012, length(distanceFromFinger));
    color = mix(color, vec3(0.96, 0.98, 0.71), marker);
  }
  gl_FragColor = vec4(color, 1.0);
}
