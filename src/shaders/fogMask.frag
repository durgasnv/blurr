uniform sampler2D uPrevious;
uniform float uGrowth;
uniform vec2 uEraseFrom;
uniform vec2 uEraseTo;
uniform float uEraseRadius;
uniform float uEraseStrength;
uniform float uAspect;
varying vec2 vUv;

void main() {
  float fog = texture2D(uPrevious, vUv).r;
  fog = clamp(fog + uGrowth, 0.0, 1.0);
  vec2 point = vUv * vec2(uAspect, 1.0);
  vec2 start = uEraseFrom * vec2(uAspect, 1.0);
  vec2 end = uEraseTo * vec2(uAspect, 1.0);
  vec2 segment = end - start;
  float along = clamp(dot(point - start, segment) / max(dot(segment, segment), 0.000001), 0.0, 1.0);
  float distanceToStroke = length(point - (start + along * segment));
  float wipe = 1.0 - smoothstep(uEraseRadius * 0.48, uEraseRadius, distanceToStroke);
  fog = max(0.0, fog - wipe * uEraseStrength);
  gl_FragColor = vec4(fog, fog, fog, 1.0);
}
