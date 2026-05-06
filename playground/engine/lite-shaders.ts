export const LITE_VERT_SRC = /* glsl */ `
  attribute vec2 a_position;
  void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
`;

export const LITE_FRAG_SRC = /* glsl */ `
  precision highp float;

  uniform vec2 u_resolution;
  uniform float u_time;
  uniform vec3 u_color1, u_color2, u_color3;
  uniform float u_intensity, u_scale, u_direction;
  uniform float u_distortion, u_shaderOpacity;

  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289v2(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289((x * 34.0 + 1.0) * x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                        -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289v2(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m; m = m * m;
    vec3 x_ = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x_) - 0.5;
    vec3 ox = floor(x_ + 0.5);
    vec3 a0 = x_ - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  vec3 palette(float t) {
    t = clamp(t, 0.0, 1.0);
    if (t < 0.5) return mix(u_color1, u_color2, t * 2.0);
    return mix(u_color2, u_color3, (t - 0.5) * 2.0);
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    float aspect = u_resolution.x / u_resolution.y;
    float t = u_time;

    vec2 p = (uv - 0.5) * u_scale;
    p.x *= aspect;
    p += vec2(cos(u_direction), sin(u_direction)) * t * 0.15;

    float freq = 6.0;
    float val = 0.0;
    val += sin(p.x * freq + t);
    val += sin(p.y * freq + t * 1.3);
    val += sin((p.x + p.y) * freq * 0.7 + t * 0.7);
    val += sin(length(p) * freq * 0.8 - t * 1.5);

    vec2 w = vec2(
      snoise(p + vec2(t * 0.1, 0.0)),
      snoise(p + vec2(0.0, t * 0.12) + 5.0)
    ) * u_distortion * 2.0;
    val += (w.x + w.y) * u_distortion;

    val = val * 0.2 * u_intensity + 0.5;
    vec3 col = palette(clamp(val, 0.0, 1.0));
    col = pow(col, vec3(1.3));

    gl_FragColor = vec4(col, u_shaderOpacity);
  }
`;
