import { Vector2 } from "three";
import type { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

const UNDERWATER_DAMPING = 5.8;

const UNDERWATER_EFFECT_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uIntensity: { value: 0 },
    uTime: { value: 0 },
    uResolution: { value: new Vector2(1, 1) },
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
    uniform float uIntensity;
    uniform float uTime;
    uniform vec2 uResolution;
    varying vec2 vUv;

    void main() {
      vec2 centered = vUv - 0.5;
      float wave = sin((vUv.y * 16.0 + uTime * 1.7)) * 0.0018 +
        cos((vUv.x * 12.0 - uTime * 1.2)) * 0.0012;
      vec2 distortion = vec2(wave, -wave * 0.6) * uIntensity;
      vec4 source = texture2D(tDiffuse, vUv + distortion);
      vec3 tint = mix(vec3(0.7, 0.92, 0.94), vec3(0.18, 0.48, 0.58), smoothstep(0.0, 0.95, length(centered)));
      vec3 color = mix(source.rgb, tint, 0.24 * uIntensity);
      color *= 1.0 - 0.18 * uIntensity;
      color += vec3(0.03, 0.08, 0.07) * uIntensity;
      gl_FragColor = vec4(color, source.a);
    }
  `,
};

type ShaderPassConstructor = new (shader: object) => ShaderPass;

export interface UnderwaterEffectUpdate {
  dt: number;
  elapsed: number;
  targetIntensity: number;
}

export class UnderwaterEffect {
  readonly element: HTMLDivElement;
  private shaderPass: ShaderPass | null = null;
  private intensity = 0;

  constructor(container: HTMLElement) {
    this.element = document.createElement("div");
    this.element.className = "underwater-effect";
    this.element.setAttribute("aria-hidden", "true");
    container.appendChild(this.element);
  }

  createShaderPass(ShaderPassCtor: ShaderPassConstructor) {
    const pass = new ShaderPassCtor(UNDERWATER_EFFECT_SHADER);
    pass.enabled = false;
    this.shaderPass = pass;
    return pass;
  }

  update({ dt, elapsed, targetIntensity }: UnderwaterEffectUpdate) {
    const blend = 1 - Math.exp(-dt * UNDERWATER_DAMPING);
    this.intensity += (Math.max(0, Math.min(1, targetIntensity)) - this.intensity) * blend;
    this.element.style.opacity = `${Math.min(0.72, this.intensity * 0.72)}`;
    this.element.classList.toggle("underwater-effect--active", this.intensity > 0.015);
    if (!this.shaderPass) {
      return;
    }
    this.shaderPass.enabled = this.intensity > 0.015;
    this.shaderPass.uniforms.uIntensity.value = this.intensity;
    this.shaderPass.uniforms.uTime.value = elapsed;
  }

  resize(width: number, height: number, pixelRatio: number) {
    this.shaderPass?.uniforms.uResolution.value.set(width * pixelRatio, height * pixelRatio);
  }

  getIntensity() {
    return this.intensity;
  }

  dispose() {
    this.shaderPass?.material.dispose();
    this.element.remove();
  }
}
