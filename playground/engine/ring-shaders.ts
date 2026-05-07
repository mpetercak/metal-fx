export const RING_VERT_SRC = /* glsl */ `
  attribute vec2 a_position;
  void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
`;

export const RING_FRAG_SRC = /* glsl */ `
  precision highp float;

  uniform vec2 u_resolution;
  uniform float u_cornerRadius;
  uniform float u_ringWidth;
  uniform float u_angleA;
  uniform float u_angleB;
  uniform vec3 u_colorA0, u_colorA1;
  uniform vec3 u_colorB0, u_colorB1;
  uniform float u_opacityA;
  uniform float u_opacityB;

  #define TAU 6.28318530718

  float roundedBoxSDF(vec2 p, vec2 b, float r) {
    vec2 d = abs(p) - b + r;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
  }

  float circDist(float a, float b) {
    float d = abs(a - b);
    return min(d, 1.0 - d);
  }

  vec4 conicLayer(float angle, float rotation, vec3 c0, vec3 c1) {
    float a = fract((angle - rotation) / TAU);

    float d0 = circDist(a, 0.235);
    float d1 = circDist(a, 0.735);

    float b0 = smoothstep(0.055, 0.008, d0);
    float b1 = smoothstep(0.055, 0.008, d1);

    float alpha = max(b0, b1);
    vec3 col = alpha > 0.001 ? (c0 * b0 + c1 * b1) / (b0 + b1 + 0.001) : vec3(0.0);
    return vec4(col, alpha);
  }

  void main() {
    vec2 fc = gl_FragCoord.xy;
    fc.y = u_resolution.y - fc.y;

    vec2 center = u_resolution * 0.5;
    vec2 p = fc - center;

    float dist = roundedBoxSDF(p, center, u_cornerRadius);

    float outer = smoothstep(0.5, -0.5, dist);
    float inner = smoothstep(-u_ringWidth - 0.5, -u_ringWidth + 0.5, dist);
    float ring = outer * inner;

    if (ring < 0.001) { gl_FragColor = vec4(0.0); return; }

    float angle = atan(p.x, -p.y);
    if (angle < 0.0) angle += TAU;

    vec4 layerA = conicLayer(angle, u_angleA, u_colorA0, u_colorA1);
    vec4 layerB = conicLayer(angle, u_angleB, u_colorB0, u_colorB1);

    float aA = layerA.a * u_opacityA;
    float aB = layerB.a * u_opacityB;

    float outAlpha = aB + aA * (1.0 - aB);
    vec3 outColor = vec3(0.0);
    if (outAlpha > 0.001) {
      outColor = (layerB.rgb * aB + layerA.rgb * aA * (1.0 - aB)) / outAlpha;
    }

    gl_FragColor = vec4(outColor, outAlpha * ring);
  }
`;
