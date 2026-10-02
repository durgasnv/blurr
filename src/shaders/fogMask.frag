uniform sampler2D uPrevious;
uniform float uGrowth;
varying vec2 vUv;

void main() {
  float fog = texture2D(uPrevious, vUv).r;
  fog = clamp(fog + uGrowth, 0.0, 1.0);
  gl_FragColor = vec4(fog, fog, fog, 1.0);
}
