import { Vector2 } from "three";

const ANIME_GRADE_STRENGTH = 0.34;
const ANIME_GRADE_BANDING = 0.18;
const ANIME_GRADE_PAPER_GRAIN = 0.009;
const ANIME_GRADE_WARMTH = 0.12;

export const ANIME_COLOR_GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uResolution: { value: new Vector2(1, 1) },
    uStrength: { value: ANIME_GRADE_STRENGTH },
    uBanding: { value: ANIME_GRADE_BANDING },
    uPaperGrain: { value: ANIME_GRADE_PAPER_GRAIN },
    uWarmth: { value: ANIME_GRADE_WARMTH },
  },
  vertexShader: `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uStrength;
    uniform float uBanding;
    uniform float uPaperGrain;
    uniform float uWarmth;
    varying vec2 vUv;

    float animeHash(vec2 p) {
      return fract(sin(dot(p, vec2(41.7, 289.3))) * 43758.5453123);
    }

    float animeNoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(animeHash(i), animeHash(i + vec2(1.0, 0.0)), u.x),
        mix(animeHash(i + vec2(0.0, 1.0)), animeHash(i + vec2(1.0, 1.0)), u.x),
        u.y
      );
    }

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 color = texel.rgb;
      float strength = clamp(uStrength, 0.0, 1.0);
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      vec2 pixel = floor(vUv * uResolution);
      float paper = animeNoise(pixel * 0.35 + vec2(7.2, uTime * 0.07)) - 0.5;
      float dither = animeHash(pixel + floor(uTime * 6.0)) - 0.5;

      float shadow = 1.0 - smoothstep(0.22, 0.58, luma);
      float highlight = smoothstep(0.5, 0.92, luma);
      float mid = smoothstep(0.2, 0.52, luma) * (1.0 - smoothstep(0.74, 0.96, luma));

      vec3 coolShadow = vec3(0.62, 0.78, 0.72);
      vec3 warmCream = vec3(1.075, 1.025, 0.88);
      vec3 meadowLift = vec3(1.02, 1.06, 0.94);
      color = mix(color, color * coolShadow, shadow * 0.18 * strength);
      color = mix(color, color * warmCream + vec3(0.014, 0.01, -0.004) * uWarmth, highlight * 0.16 * strength);
      color = mix(color, color * meadowLift, mid * 0.06 * strength);

      float bandCount = 6.0;
      float bandedLuma = floor(luma * bandCount + 0.5 + dither * 0.18) / bandCount;
      float bandScale = bandedLuma / max(luma, 0.001);
      color *= mix(1.0, bandScale, uBanding * strength * (0.68 + shadow * 0.26));

      float gray = dot(color, vec3(0.299, 0.587, 0.114));
      color = mix(vec3(gray), color, 1.065 + 0.035 * strength);
      color += paper * uPaperGrain * strength * (0.72 + luma * 0.28);
      color = mix(color, smoothstep(vec3(0.018), vec3(0.985), color), 0.08 * strength);
      gl_FragColor = vec4(clamp(color, 0.0, 1.0), texel.a);
    }
  `,
};
