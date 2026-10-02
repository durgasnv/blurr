uniform sampler2D uPrevious;
uniform float uGrowth;
uniform float uBlowRadius;
uniform float uWetDecay;
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
  float rim = smoothstep(uEraseRadius * 0.64, uEraseRadius * 0.93, distanceToStroke)
    * (1.0 - smoothstep(uEraseRadius * 0.94, uEraseRadius * 1.42, distanceToStroke));
  wet = max(wet, rim * uEraseStrength * 0.72);
  gl_FragColor = vec4(fog, wet, 0.0, 1.0);
}
