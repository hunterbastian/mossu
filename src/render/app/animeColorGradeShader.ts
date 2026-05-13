import { Vector2 } from "three";

const ANIME_GRADE_STRENGTH = 0.42;
const ANIME_GRADE_BANDING = 0.28;
const ANIME_GRADE_PAPER_GRAIN = 0.012;
const ANIME_GRADE_WARMTH = 0.2;

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

      float shadow = 1.0 - smoothstep(0.2, 0.58, luma);
      float highlight = smoothstep(0.48, 0.9, luma);
      float mid = smoothstep(0.18, 0.52, luma) * (1.0 - smoothstep(0.72, 0.96, luma));
      float horizonWash = exp(-pow((vUv.y - 0.45) * 3.2, 2.0)) * (1.0 - smoothstep(0.72, 1.0, vUv.y));
      float skyLift = smoothstep(0.5, 1.0, vUv.y);
      float sunWash = 1.0 - smoothstep(0.05, 0.72, distance(vUv, vec2(0.14, 0.18)));

      vec3 coolShadow = vec3(0.54, 0.76, 0.72);
      vec3 peachShadow = vec3(0.93, 0.82, 0.68);
      vec3 warmCream = vec3(1.12, 1.045, 0.82);
      vec3 meadowLift = vec3(1.035, 1.09, 0.9);
      vec3 cleanSky = vec3(0.94, 1.035, 1.12);
      color = mix(color, color * coolShadow, shadow * 0.22 * strength);
      color = mix(color, color * peachShadow, shadow * horizonWash * 0.035 * strength);
      color = mix(color, color * warmCream + vec3(0.024, 0.016, -0.008) * uWarmth, highlight * 0.22 * strength);
      color = mix(color, color * meadowLift, mid * 0.1 * strength);
      color = mix(color, color * cleanSky + vec3(-0.004, 0.006, 0.016), skyLift * 0.06 * strength);
      color += vec3(0.022, 0.013, -0.01) * horizonWash * highlight * uWarmth * strength;
      color += vec3(0.038, 0.024, -0.01) * sunWash * (0.03 + highlight * 0.05) * strength;

      float bandCount = mix(5.0, 7.0, smoothstep(0.42, 0.86, luma));
      float bandedLuma = floor(luma * bandCount + 0.5 + dither * 0.22) / bandCount;
      float bandScale = bandedLuma / max(luma, 0.001);
      color *= mix(1.0, bandScale, uBanding * strength * (0.78 + shadow * 0.22));

      float gray = dot(color, vec3(0.299, 0.587, 0.114));
      color = mix(vec3(gray), color, 1.09 + 0.045 * strength);
      color += paper * uPaperGrain * strength * (0.74 + luma * 0.32);
      color += vec3(1.0, 0.86, 0.62) * (animeNoise(pixel * 0.055 + vec2(uTime * 0.015, 3.0)) - 0.5) * 0.004 * strength;
      color = (color - vec3(0.5)) * (1.0 + 0.56 * strength) + vec3(0.5);
      color = mix(color, smoothstep(vec3(0.014), vec3(0.988), color), 0.1 * strength);
      gl_FragColor = vec4(clamp(color, 0.0, 1.0), texel.a);
    }
  `,
};
