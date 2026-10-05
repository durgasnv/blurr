uniform sampler2D uFogMask;
uniform sampler2D uCamera;
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
  vec2 mirrored = vec2(1.0 - uv.x, uv.y);
  vec2 cameraUv = (mirrored - 0.5) * uVideoCrop + 0.5;
  return texture2D(uCamera, clamp(cameraUv, 0.0, 1.0)).rgb;
}

vec3 diffuseBackground(vec2 uv, float radius) {
  vec2 blur = vec2(radius / uAspect, radius);
  if (uQuality > 1.5) {
    vec3 sum = sampleBackground(uv) * 0.25;
    sum += sampleBackground(uv + vec2(blur.x, 0.0)) * 0.125;
    sum += sampleBackground(uv - vec2(blur.x, 0.0)) * 0.125;
    sum += sampleBackground(uv + vec2(0.0, blur.y)) * 0.125;
    sum += sampleBackground(uv - vec2(0.0, blur.y)) * 0.125;
    sum += sampleBackground(uv + blur) * 0.0625;
    sum += sampleBackground(uv - blur) * 0.0625;
    sum += sampleBackground(uv + vec2(blur.x, -blur.y)) * 0.0625;
    sum += sampleBackground(uv + vec2(-blur.x, blur.y)) * 0.0625;
    return sum;
  }
  vec3 sum = sampleBackground(uv) * 0.4;
  sum += sampleBackground(uv + vec2(blur.x, 0.0)) * 0.15;
  sum += sampleBackground(uv - vec2(blur.x, 0.0)) * 0.15;
  sum += sampleBackground(uv + vec2(0.0, blur.y)) * 0.15;
  sum += sampleBackground(uv - vec2(0.0, blur.y)) * 0.15;
  return sum;
}

float microDroplets(vec2 uv, out vec2 normal, out float highlight, out float rim) {
  vec2 grid = uv * vec2(uAspect, 1.0) * 92.0;
  vec2 cell = floor(grid);
  vec2 local = fract(grid);
  float nearest = 10.0;
  float beadRadius = 0.14;
  vec2 beadDelta = vec2(0.0);
  float seed = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 offset = vec2(float(x), float(y));
      vec2 candidate = cell + offset;
      float id = hash21(candidate);
      vec2 center = vec2(hash21(candidate + vec2(3.1)), hash21(candidate + vec2(7.7))) * 0.62 + 0.19;
      vec2 delta = offset + center - local;
      float distanceToBead = length(delta);
      if (distanceToBead < nearest) {
        nearest = distanceToBead;
        beadDelta = delta;
        beadRadius = mix(0.09, 0.22, hash21(candidate + vec2(11.4)));
        seed = id;
      }
    }
  }
  float body = 1.0 - smoothstep(beadRadius * 0.52, beadRadius, nearest);
  rim = smoothstep(beadRadius * 0.72, beadRadius * 0.90, nearest)
    * (1.0 - smoothstep(beadRadius * 0.90, beadRadius, nearest));
  vec2 direction = beadDelta / max(nearest, 0.001);
  normal = vec2(direction.x / uAspect, direction.y) * body * beadRadius * 0.32 / 92.0;
  vec2 glintOffset = beadDelta + vec2(0.055, -0.065);
  highlight = exp(-dot(glintOffset, glintOffset) * 1200.0) * (0.55 + seed * 0.45);
  return body;
}

void main() {
  vec2 drift = vec2(uTime * 0.012, -uTime * 0.007);
  float cloud = uQuality < 0.5 ? valueNoise(vUv * 3.8 + drift) : fbm(vUv * 3.8 + drift);
  float finer = uQuality < 0.5 ? 0.5 : valueNoise(vUv * 32.0 - drift * 2.0);
  float grain = hash21(vUv * 1200.0);
  float density = clamp(cloud * 0.78 + finer * 0.18 + grain * 0.04, 0.0, 1.0);
  vec4 moisture = texture2D(uFogMask, vUv);
  float mask = moisture.r;
  float wet = moisture.g;
  float fog = mask * smoothstep(0.08, 0.72, density);
  vec2 beadNormal = vec2(0.0);
  float beadHighlight = 0.0;
  float beadRim = 0.0;
  float beads = 0.0;
  if (uQuality > 0.5) beads = microDroplets(vUv, beadNormal, beadHighlight, beadRim);
  float beadVisibility = smoothstep(0.14, 0.48, mask) * smoothstep(0.14, 0.48, density);
  vec2 texel = vec2(0.0025 / uAspect, 0.0025);
  vec2 maskSlope = vec2(
    texture2D(uFogMask, vUv + vec2(texel.x, 0.0)).r - texture2D(uFogMask, vUv - vec2(texel.x, 0.0)).r,
    texture2D(uFogMask, vUv + vec2(0.0, texel.y)).r - texture2D(uFogMask, vUv - vec2(0.0, texel.y)).r
  );
  vec2 surfaceSlope = vec2(0.0);
  if (uQuality > 0.5) {
    surfaceSlope = vec2(
      valueNoise(vUv * 34.0 + vec2(0.03, 0.0)) - valueNoise(vUv * 34.0 - vec2(0.03, 0.0)),
      valueNoise(vUv * 34.0 + vec2(0.0, 0.03)) - valueNoise(vUv * 34.0 - vec2(0.0, 0.03))
    );
  }
  vec2 wetSlope = vec2(
    texture2D(uFogMask, vUv + vec2(texel.x, 0.0)).g - texture2D(uFogMask, vUv - vec2(texel.x, 0.0)).g,
    texture2D(uFogMask, vUv + vec2(0.0, texel.y)).g - texture2D(uFogMask, vUv - vec2(0.0, texel.y)).g
  );
  vec2 dropNormal = vec2(0.0);
  float dropRim = 0.0;
  float dropVisibility = smoothstep(0.08, 0.28, mask);
  for (int i = 0; i < 12; i++) {
    if (i >= uDropCount) break;
    vec2 delta = (vUv - uDrops[i].xy) * vec2(uAspect, 1.0);
    float radius = uDrops[i].z;
    float distanceToDrop = length(delta);
    float lens = 1.0 - smoothstep(radius * 0.2, radius, distanceToDrop);
    float edge = smoothstep(radius * 0.68, radius * 0.88, distanceToDrop)
      * (1.0 - smoothstep(radius * 0.88, radius * 1.08, distanceToDrop));
    dropNormal += delta / max(distanceToDrop, 0.001) * lens * radius * 0.35 * dropVisibility;
    dropRim += edge * dropVisibility;
  }
  vec2 displaced = clamp(vUv + (maskSlope * 0.018 + surfaceSlope * 0.012) * fog + wetSlope * wet * 0.025 + dropNormal + beadNormal * beadVisibility, 0.0, 1.0);
  vec3 sharp = sampleBackground(displaced);
  float blurRadius = mix(0.002, 0.048, smoothstep(0.03, 0.72, fog));
  vec3 diffused = diffuseBackground(displaced, blurRadius);
  float diffusion = smoothstep(0.015, 0.58, fog);
  vec3 color = mix(sharp, diffused, diffusion * 0.94);
  float scattering = diffusion * (0.10 + density * 0.07);
  color = mix(color, vec3(0.88, 0.90, 0.89), scattering);
  color = mix(color, color * 0.88, beadRim * beadVisibility * 0.18);
  color += beadHighlight * beads * beadVisibility * vec3(0.035, 0.04, 0.035);
  color = mix(color, color * 0.70 + vec3(0.035, 0.064, 0.048), wet * 0.5);
  color += wet * max(0.0, wetSlope.y) * vec3(0.11, 0.16, 0.12);
  color = mix(color, color * 0.78, clamp(dropRim, 0.0, 1.0) * 0.26);
  color += clamp(dropRim, 0.0, 1.0) * vec3(0.065, 0.075, 0.055);
  color += (grain - 0.5) * fog * 0.025;
  float opacity = 1.0;
  if (uDebugFinger > 0.5 && uFinger.x >= 0.0) {
    vec2 distanceFromFinger = (vUv - uFinger) * vec2(uAspect, 1.0);
    float marker = 1.0 - smoothstep(0.008, 0.012, length(distanceFromFinger));
    color = mix(color, vec3(0.96, 0.98, 0.71), marker);
    opacity = max(opacity, marker * 0.9);
  }
  gl_FragColor = vec4(color, opacity);
}
