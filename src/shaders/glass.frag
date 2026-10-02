uniform sampler2D uFogMask;
uniform float uTime;
uniform vec2 uFinger;
uniform float uDebugFinger;
uniform float uAspect;
varying vec2 vUv;

void main() {
  vec2 drift = vec2(uTime * 0.012, -uTime * 0.007);
  float cloud = fbm(vUv * 3.8 + drift);
  float finer = valueNoise(vUv * 32.0 - drift * 2.0);
  float grain = hash21(vUv * 1200.0);
  float density = clamp(cloud * 0.78 + finer * 0.18 + grain * 0.04, 0.0, 1.0);
  vec4 moisture = texture2D(uFogMask, vUv);
  float mask = moisture.r;
  float wet = moisture.g;
  float fog = mask * smoothstep(0.08, 0.72, density);
  vec2 texel = vec2(0.0025 / uAspect, 0.0025);
  vec2 maskSlope = vec2(
    texture2D(uFogMask, vUv + vec2(texel.x, 0.0)).r - texture2D(uFogMask, vUv - vec2(texel.x, 0.0)).r,
    texture2D(uFogMask, vUv + vec2(0.0, texel.y)).r - texture2D(uFogMask, vUv - vec2(0.0, texel.y)).r
  );
  vec2 surfaceSlope = vec2(
    valueNoise(vUv * 34.0 + vec2(0.03, 0.0)) - valueNoise(vUv * 34.0 - vec2(0.03, 0.0)),
    valueNoise(vUv * 34.0 + vec2(0.0, 0.03)) - valueNoise(vUv * 34.0 - vec2(0.0, 0.03))
  );
  vec2 wetSlope = vec2(
    texture2D(uFogMask, vUv + vec2(texel.x, 0.0)).g - texture2D(uFogMask, vUv - vec2(texel.x, 0.0)).g,
    texture2D(uFogMask, vUv + vec2(0.0, texel.y)).g - texture2D(uFogMask, vUv - vec2(0.0, texel.y)).g
  );
  vec2 displaced = clamp(vUv + (maskSlope * 0.012 + surfaceSlope * 0.025) * fog + wetSlope * wet * 0.018, 0.0, 1.0);
  vec3 sharp = atmosphericRoom(displaced);
  vec2 blurOffset = vec2(0.012 / uAspect, 0.012) * fog;
  vec3 diffused = (atmosphericRoom(displaced + blurOffset) + atmosphericRoom(displaced - blurOffset)) * 0.5;
  vec3 color = mix(sharp, diffused, fog * 0.7);
  color = mix(color, vec3(0.59, 0.68, 0.63), fog * 0.42);
  color = mix(color, color * 0.70 + vec3(0.035, 0.064, 0.048), wet * 0.5);
  color += wet * max(0.0, wetSlope.y) * vec3(0.11, 0.16, 0.12);
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
