uniform sampler2D uPrevious;
uniform float uGrowth;
uniform float uBlowRadius;
uniform vec2 uEraseFrom;
uniform vec2 uEraseTo;
uniform float uEraseRadius;
uniform float uEraseStrength;
uniform float uAspect;
varying vec2 vUv;

void main() {
  float fog = texture2D(uPrevious, vUv).r;
  vec2 fromCenter = (vUv - vec2(0.5, 0.48)) * vec2(uAspect, 1.0);
  float reach = 1.0 - smoothstep(uBlowRadius * 0.38, uBlowRadius, length(fromCenter));
  float patch = mix(0.4, 1.3, smoothstep(0.23, 0.7, fbm(vUv * 5.3 + vec2(4.2, 8.1))));
  fog = clamp(fog + uGrowth * reach * patch, 0.0, 1.0);
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
