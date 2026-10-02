uniform float uFog;
uniform float uTime;
varying vec2 vUv;

void main() {
  vec2 drift = vec2(uTime * 0.012, -uTime * 0.007);
  float cloud = fbm(vUv * 3.8 + drift);
  float finer = valueNoise(vUv * 32.0 - drift * 2.0);
  float grain = hash21(vUv * 1200.0);
  float density = clamp(cloud * 0.78 + finer * 0.18 + grain * 0.04, 0.0, 1.0);
  vec3 clearTint = vec3(0.83, 0.90, 0.86);
  vec3 fogTint = vec3(0.89, 0.94, 0.91);
  float fog = clamp(uFog, 0.0, 1.0) * smoothstep(0.08, 0.72, density);
  float opacity = mix(0.08, 0.48, fog);
  gl_FragColor = vec4(mix(clearTint, fogTint, fog), opacity);
}
