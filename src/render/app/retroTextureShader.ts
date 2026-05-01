import { Vector2 } from "three";

const RETRO_TEXTURE_GRAIN_STRENGTH = 0.018;
const RETRO_TEXTURE_DITHER_STRENGTH = 0.012;
const RETRO_TEXTURE_SCANLINE_STRENGTH = 0.045;
const RETRO_TEXTURE_VIGNETTE_STRENGTH = 0.036;
const RETRO_TEXTURE_QUANTIZE_STRENGTH = 0.18;
const RETRO_TEXTURE_PIXEL_BLOCK = 1.85;
const RETRO_TEXTURE_CHROMA_STRENGTH = 0.0009;
const RETRO_TEXTURE_TONE_STRENGTH = 0.16;

export const RETRO_RENDER_TEXTURE_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uResolution: { value: new Vector2(1, 1) },
    uGrainStrength: { value: RETRO_TEXTURE_GRAIN_STRENGTH },
    uDitherStrength: { value: RETRO_TEXTURE_DITHER_STRENGTH },
    uScanlineStrength: { value: RETRO_TEXTURE_SCANLINE_STRENGTH },
    uVignetteStrength: { value: RETRO_TEXTURE_VIGNETTE_STRENGTH },
    uQuantizeStrength: { value: RETRO_TEXTURE_QUANTIZE_STRENGTH },
    uPixelBlock: { value: RETRO_TEXTURE_PIXEL_BLOCK },
    uChromaStrength: { value: RETRO_TEXTURE_CHROMA_STRENGTH },
    uToneStrength: { value: RETRO_TEXTURE_TONE_STRENGTH },
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
    uniform float uGrainStrength;
    uniform float uDitherStrength;
    uniform float uScanlineStrength;
    uniform float uVignetteStrength;
    uniform float uQuantizeStrength;
    uniform float uPixelBlock;
    uniform float uChromaStrength;
    uniform float uToneStrength;
    varying vec2 vUv;

    float retroHash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    float bayer4(vec2 p) {
      vec2 q = mod(p, 4.0);
      float row0 = q.x < 1.0 ? 0.0 : q.x < 2.0 ? 8.0 : q.x < 3.0 ? 2.0 : 10.0;
      float row1 = q.x < 1.0 ? 12.0 : q.x < 2.0 ? 4.0 : q.x < 3.0 ? 14.0 : 6.0;
      float row2 = q.x < 1.0 ? 3.0 : q.x < 2.0 ? 11.0 : q.x < 3.0 ? 1.0 : 9.0;
      float row3 = q.x < 1.0 ? 15.0 : q.x < 2.0 ? 7.0 : q.x < 3.0 ? 13.0 : 5.0;
      float row = q.y < 1.0 ? row0 : q.y < 2.0 ? row1 : q.y < 3.0 ? row2 : row3;
      return row / 15.0 - 0.5;
    }

    void main() {
      vec2 blockResolution = max(uResolution / max(uPixelBlock, 1.0), vec2(1.0));
      vec2 sampledUv = (floor(vUv * blockResolution) + 0.5) / blockResolution;
      vec2 centered = sampledUv * 2.0 - 1.0;
      float edgePull = smoothstep(0.08, 1.2, dot(centered, centered));
      vec2 chromaOffset = vec2(uChromaStrength * edgePull, 0.0);
      vec4 texel = texture2D(tDiffuse, sampledUv);
      texel.r = texture2D(tDiffuse, sampledUv + chromaOffset).r;
      texel.b = texture2D(tDiffuse, sampledUv - chromaOffset).b;
      vec2 pixel = floor(sampledUv * uResolution);
      float luma = dot(texel.rgb, vec3(0.2126, 0.7152, 0.0722));
      float grain = retroHash(pixel + floor(uTime * 18.0)) - 0.5;
      float dither = bayer4(pixel) * 0.75 + (retroHash(mod(pixel, vec2(8.0)) * 11.0 + vec2(3.7, 9.2)) - 0.5) * 0.25;
      float scanline = step(1.0, mod(pixel.y, 2.0));
      vec3 color = texel.rgb;
      color += grain * uGrainStrength * (0.72 + luma * 0.28);
      color += dither * uDitherStrength;
      color *= 1.0 - scanline * uScanlineStrength;

      vec3 quantized = floor(color * 48.0 + dither * 0.5) / 48.0;
      color = mix(color, quantized, uQuantizeStrength);

      float vignette = smoothstep(1.35, 0.3, dot(centered, centered));
      color *= mix(1.0 - uVignetteStrength, 1.0, vignette);

      float warmLift = smoothstep(0.15, 0.85, luma);
      color = mix(color, color * vec3(1.035, 1.018, 0.95), 0.1 * warmLift);
      color = mix(color, smoothstep(vec3(0.02), vec3(0.98), color), uToneStrength);
      gl_FragColor = vec4(clamp(color, 0.0, 1.0), texel.a);
    }
  `,
};
