uniform float uFog;
varying vec2 vUv;

void main() {
  vec3 clearTint = vec3(0.83, 0.90, 0.86);
  vec3 fogTint = vec3(0.89, 0.94, 0.91);
  float fog = clamp(uFog, 0.0, 1.0);
  float opacity = mix(0.08, 0.38, fog);
  gl_FragColor = vec4(mix(clearTint, fogTint, fog), opacity);
}
