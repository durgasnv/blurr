vec3 atmosphericRoom(vec2 uv) {
  vec2 p = uv - vec2(0.5, 0.5);
  float wallNoise = valueNoise(uv * 3.4 + vec2(2.1, 7.3));
  vec3 room = vec3(0.045, 0.070, 0.061) + wallNoise * vec3(0.018, 0.020, 0.016);

  float leftShadow = 1.0 - smoothstep(0.12, 0.36, uv.x);
  float rightShadow = smoothstep(0.72, 0.96, uv.x);
  room *= 1.0 - 0.32 * leftShadow - 0.25 * rightShadow;

  float mirrorArch = length(vec2(p.x * 1.1, max(p.y, -0.08) * 0.78));
  float innerLight = 1.0 - smoothstep(0.43, 0.64, mirrorArch);
  room += innerLight * vec3(0.026, 0.035, 0.025);

  vec2 warm = (uv - vec2(0.70, 0.73)) * vec2(1.4, 1.0);
  float glow = exp(-dot(warm, warm) * 21.0);
  room += glow * vec3(0.30, 0.23, 0.13);
  float softBokeh = exp(-dot(uv - vec2(0.23, 0.60), uv - vec2(0.23, 0.60)) * 110.0);
  room += softBokeh * vec3(0.13, 0.15, 0.10);

  float lowerSilhouette = 1.0 - smoothstep(0.32, 0.49, uv.y);
  room *= 1.0 - lowerSilhouette * 0.35;
  return room;
}
