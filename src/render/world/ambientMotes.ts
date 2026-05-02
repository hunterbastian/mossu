/**
 * Ambient motes — biome-aware drifting particles around the player.
 *
 * Pollen in the meadow, dust in the burrow shadows, downy seeds in the forest,
 * snow flurries on the ridge. One InstancedMesh, lifecycle-driven respawn, fade
 * envelope from `motionCurves`. Cheap and bounded — no growing pools.
 */

import {
  AdditiveBlending,
  BufferGeometry,
  Camera,
  Color,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
} from "three";
import type { BiomeZone } from "../../simulation/world";
import { easeInOutSine, easeOutCubic } from "../motionCurves";

/**
 * Per-biome look. Density is the share of the global pool used in this biome
 * (0..1 — they don't have to sum to 1; the effective count is `pool * density`).
 * Size is in world units; speed is the base drift in m/s.
 */
export interface MoteBiomePalette {
  colors: readonly string[];
  density: number;
  size: number;
  speed: number;
  rise: number;
  lifeSeconds: number;
  blending: "alpha" | "additive";
}

// ─────────────────────────────────────────────────────────────────────────────
// Biome → mote palette table.
//
// Each biome has its own particle character. Reading top to bottom of the climb:
//   plains       — warm pollen glow (Burrow Hollow welcome)
//   hills        — same family, dustier; smooth handoff from plains
//   foothills    — downy seed pods with a tiny forest-spirit read
//   alpine       — pale alpine dust, gentle fall
//   ridge        — brisk snow flurry, falls fast (tells you the wind is sharp)
//   peak_shrine  — sparse spirit lights, additive, slow rise (sacred, not weather)
//
// Tune freely. Blending: "additive" reads magical/glowing; "alpha" reads physical.
// Speed range 0.05–0.3 m/s feels cozy; rise sign chooses lift vs fall.
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_BIOME_PALETTES: Record<BiomeZone, MoteBiomePalette> = {
  plains: {
    colors: ["#fff5cc", "#ffe898", "#ffd97a", "#fcb86b"],
    density: 0.85,
    size: 0.26,
    speed: 0.16,
    rise: 0.08,
    lifeSeconds: 7.0,
    blending: "additive",
  },
  hills: {
    colors: ["#f8e6b8", "#e8d8a0", "#d4c490"],
    density: 0.7,
    size: 0.28,
    speed: 0.14,
    rise: 0.04,
    lifeSeconds: 6.5,
    blending: "additive",
  },
  foothills: {
    colors: ["#f0ecd8", "#dcd8b8", "#b8c6a0"],
    density: 0.6,
    size: 0.42,
    speed: 0.1,
    rise: 0.02,
    lifeSeconds: 8.0,
    blending: "alpha",
  },
  alpine: {
    colors: ["#f4f8fb", "#e0e8ee", "#c4d2dc"],
    density: 0.7,
    size: 0.34,
    speed: 0.18,
    rise: -0.05,
    lifeSeconds: 5.5,
    blending: "alpha",
  },
  ridge: {
    colors: ["#fcfdfe", "#e8eef4", "#cad5e0"],
    density: 0.95,
    size: 0.36,
    speed: 0.3,
    rise: -0.1,
    lifeSeconds: 4.0,
    blending: "alpha",
  },
  peak_shrine: {
    colors: ["#e8f4ff", "#c8dcff", "#aab8ff", "#fff4d8"],
    density: 0.55,
    size: 0.46,
    speed: 0.1,
    rise: 0.06,
    lifeSeconds: 5.5,
    blending: "additive",
  },
};

export interface AmbientMoteOptions {
  /** Total particle pool. Stays constant; biome density modulates how many are visible. */
  poolSize?: number;
  /** Half-extent of the spawn box around the player (world units). */
  fieldExtent?: number;
  /** Vertical span of the spawn box (world units). */
  fieldHeight?: number;
  /** Override the per-biome palette table (full or partial). */
  palettes?: Partial<Record<BiomeZone, Partial<MoteBiomePalette>>>;
  /** Wake displacement radius around the player (world units). 0 disables. */
  wakeRadius?: number;
  /** Push strength multiplier — how hard motes shove outward per m/s of player speed. */
  wakeStrength?: number;
  /** Brightness lift on disturbed motes (0..1). */
  wakeBrightness?: number;
}

interface MoteInstance {
  // World-space position.
  px: number;
  py: number;
  pz: number;
  // Drift velocity.
  vx: number;
  vy: number;
  vz: number;
  // Lifecycle.
  age: number;
  life: number;
  // Visual.
  size: number;
  color: Color;
  // Whether this slot is currently active under the biome density gate.
  active: boolean;
}

export interface AmbientMoteSystem {
  readonly group: Group;
  update(
    elapsed: number,
    dt: number,
    playerPosition: Vector3,
    camera: Camera,
    biomeZone: BiomeZone,
    windDirection?: Vector3,
    playerVelocity?: Vector3,
  ): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

const _scratchMatrix = new Matrix4();
const _scratchOffset = new Vector3();
const _camRight = new Vector3();
const _camUp = new Vector3();

function makeMoteGeometry(): BufferGeometry {
  // One billboarded quad — we expand corners in the shader so we can keep the
  // base geometry tiny and let the instance attribute carry size + alpha.
  const geometry = new PlaneGeometry(1, 1, 1, 1);
  // PlaneGeometry has uv already; we keep position as a unit quad and offset
  // toward the camera in vertex shader using camera right/up uniforms.
  return geometry;
}

function makeMoteMaterial(blending: "alpha" | "additive"): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    ...(blending === "additive" ? { blending: AdditiveBlending } : {}),
    uniforms: {
      uCameraRight: { value: new Vector3(1, 0, 0) },
      uCameraUp: { value: new Vector3(0, 1, 0) },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aAlpha;
      uniform vec3 uCameraRight;
      uniform vec3 uCameraUp;
      varying vec3 vColor;
      varying float vAlpha;
      varying vec2 vUv;

      void main() {
        vColor = aColor;
        vAlpha = aAlpha;
        vUv = uv - 0.5;

        // Instance origin from instance matrix; expand quad in camera plane.
        vec4 origin = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec3 worldPos = origin.xyz
          + uCameraRight * (position.x * aSize)
          + uCameraUp * (position.y * aSize);
        vec4 mvPosition = viewMatrix * vec4(worldPos, 1.0);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vAlpha;
      varying vec2 vUv;

      void main() {
        // Soft round mote with falloff toward edge.
        float r = length(vUv) * 2.0;
        float disc = smoothstep(1.0, 0.32, r);
        float halo = smoothstep(1.4, 0.0, r) * 0.5;
        float a = (disc + halo) * vAlpha;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vColor, a);
      }
    `,
  });
}

function mergePalettes(
  base: Record<BiomeZone, MoteBiomePalette>,
  override: Partial<Record<BiomeZone, Partial<MoteBiomePalette>>> | undefined,
): Record<BiomeZone, MoteBiomePalette> {
  if (!override) return base;
  const merged = { ...base };
  (Object.keys(override) as BiomeZone[]).forEach((key) => {
    const patch = override[key];
    if (patch) merged[key] = { ...base[key], ...patch };
  });
  return merged;
}

export function buildAmbientMotes(options: AmbientMoteOptions = {}): AmbientMoteSystem {
  const poolSize = options.poolSize ?? 96;
  const fieldExtent = options.fieldExtent ?? 26;
  const fieldHeight = options.fieldHeight ?? 8;
  const palettes = mergePalettes(DEFAULT_BIOME_PALETTES, options.palettes);
  const wakeRadius = options.wakeRadius ?? 3.2;
  const wakeStrength = options.wakeStrength ?? 0.42;
  const wakeBrightness = options.wakeBrightness ?? 0.55;

  const group = new Group();
  group.name = "ambient-motes";

  // We split into two meshes (alpha vs additive) so blending can vary by biome
  // without per-instance branching in the shader.
  const geometry = makeMoteGeometry();
  const matAlpha = makeMoteMaterial("alpha");
  const matAdditive = makeMoteMaterial("additive");

  // Instance attributes are shared by index across both meshes; we just hide
  // unused slots by setting alpha to 0 in the inactive blending mode.
  const colors = new Float32Array(poolSize * 3);
  const sizes = new Float32Array(poolSize);
  const alphasAlpha = new Float32Array(poolSize);
  const alphasAdditive = new Float32Array(poolSize);

  geometry.setAttribute("aColor", new InstancedBufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new InstancedBufferAttribute(sizes, 1));

  // Per-mesh attribute for alpha so we can mute the wrong-blend mesh per slot.
  const geometryAlpha = geometry.clone();
  const geometryAdditive = geometry.clone();
  geometryAlpha.setAttribute("aAlpha", new InstancedBufferAttribute(alphasAlpha, 1));
  geometryAdditive.setAttribute("aAlpha", new InstancedBufferAttribute(alphasAdditive, 1));

  const meshAlpha = new InstancedMesh(geometryAlpha, matAlpha, poolSize);
  const meshAdditive = new InstancedMesh(geometryAdditive, matAdditive, poolSize);
  meshAlpha.frustumCulled = false;
  meshAdditive.frustumCulled = false;
  meshAlpha.renderOrder = 4;
  meshAdditive.renderOrder = 5;
  group.add(meshAlpha, meshAdditive);

  const motes: MoteInstance[] = Array.from({ length: poolSize }, () => ({
    px: 0,
    py: 0,
    pz: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    age: 0,
    life: 0,
    size: 0,
    color: new Color(),
    active: false,
  }));

  function pickColor(palette: MoteBiomePalette): Color {
    const choice = palette.colors[Math.floor(Math.random() * palette.colors.length)] ?? "#ffffff";
    return new Color(choice);
  }

  function respawnMote(mote: MoteInstance, palette: MoteBiomePalette, around: Vector3) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.sqrt(Math.random()) * fieldExtent;
    mote.px = around.x + Math.cos(angle) * radius;
    mote.pz = around.z + Math.sin(angle) * radius;
    mote.py = around.y + (Math.random() - 0.4) * fieldHeight;

    const driftAngle = Math.random() * Math.PI * 2;
    const speedJitter = 0.6 + Math.random() * 0.8;
    mote.vx = Math.cos(driftAngle) * palette.speed * speedJitter;
    mote.vz = Math.sin(driftAngle) * palette.speed * speedJitter;
    mote.vy = palette.rise * (0.7 + Math.random() * 0.6);

    mote.size = palette.size * (0.7 + Math.random() * 0.6);
    mote.color = pickColor(palette);
    mote.life = palette.lifeSeconds * (0.75 + Math.random() * 0.5);
    mote.age = Math.random() * mote.life * 0.4; // stagger so they don't all bloom together
  }

  function update(
    elapsed: number,
    dt: number,
    playerPosition: Vector3,
    camera: Camera,
    biomeZone: BiomeZone,
    windDirection?: Vector3,
    playerVelocity?: Vector3,
  ) {
    const palette = palettes[biomeZone] ?? palettes.plains;
    const additive = palette.blending === "additive";
    const activeCount = Math.round(poolSize * Math.max(0, Math.min(1, palette.density)));

    // Camera basis for billboarding (write once per frame).
    camera.matrixWorld.extractBasis(_camRight, _camUp, _scratchOffset);
    matAlpha.uniforms.uCameraRight.value.copy(_camRight);
    matAlpha.uniforms.uCameraUp.value.copy(_camUp);
    matAdditive.uniforms.uCameraRight.value.copy(_camRight);
    matAdditive.uniforms.uCameraUp.value.copy(_camUp);

    const wx = windDirection?.x ?? 0.18;
    const wz = windDirection?.z ?? 0.06;

    // Mossu wake — push motes outward in the player's direction of travel.
    const vx = playerVelocity?.x ?? 0;
    const vz = playerVelocity?.z ?? 0;
    const playerSpeed = Math.hypot(vx, vz);
    const wakeActive = wakeRadius > 0 && playerSpeed > 0.05;
    const wakeRadiusSq = wakeRadius * wakeRadius;

    for (let i = 0; i < poolSize; i += 1) {
      const mote = motes[i];
      const shouldBeActive = i < activeCount;

      if (!mote.active && shouldBeActive) {
        respawnMote(mote, palette, playerPosition);
        mote.active = true;
      } else if (mote.active && !shouldBeActive) {
        mote.active = false;
      }

      if (!mote.active) {
        alphasAlpha[i] = 0;
        alphasAdditive[i] = 0;
        _scratchMatrix.makeTranslation(0, -10000, 0);
        meshAlpha.setMatrixAt(i, _scratchMatrix);
        meshAdditive.setMatrixAt(i, _scratchMatrix);
        continue;
      }

      // Tick lifecycle.
      mote.age += dt;
      if (mote.age >= mote.life) {
        respawnMote(mote, palette, playerPosition);
      }

      // Respawn if the player walked too far away from this mote.
      const offsetX = mote.px - playerPosition.x;
      const offsetZ = mote.pz - playerPosition.z;
      const radialSq = offsetX * offsetX + offsetZ * offsetZ;
      if (radialSq > fieldExtent * fieldExtent * 1.6) {
        respawnMote(mote, palette, playerPosition);
      }

      // Drift. Wind shoves laterally; gentle bob from sine.
      const bob = Math.sin(elapsed * 1.3 + i * 0.7) * 0.18;
      mote.px += (mote.vx + wx * 0.4) * dt;
      mote.py += (mote.vy + bob * 0.05) * dt;
      mote.pz += (mote.vz + wz * 0.4) * dt;

      // Mossu wake — radial push outward, biased forward along velocity.
      // Closer motes get shoved harder; falloff via easeOutCubic so the bubble
      // has a soft edge rather than a hard cutoff.
      let wakeDisturbance = 0;
      if (wakeActive) {
        const dx = mote.px - playerPosition.x;
        const dz = mote.pz - playerPosition.z;
        const distSq = dx * dx + dz * dz;
        if (distSq < wakeRadiusSq && distSq > 0.0001) {
          const dist = Math.sqrt(distSq);
          const proximity = 1 - dist / wakeRadius; // 1 at center, 0 at edge
          // Forward bias — motes ahead of Mossu get a stronger nudge so it
          // reads like air parting around her rather than a uniform halo.
          const dirX = dx / dist;
          const dirZ = dz / dist;
          const forwardDot = (vx * dirX + vz * dirZ) / Math.max(playerSpeed, 0.0001);
          const forwardBias = 0.7 + 0.5 * Math.max(0, forwardDot);
          const push = easeOutCubic(proximity) * playerSpeed * wakeStrength * forwardBias;
          mote.px += dirX * push * dt * 14;
          mote.pz += dirZ * push * dt * 14;
          // Small lift on disturbance — motes lofted by the wake settle slower.
          mote.py += proximity * playerSpeed * 0.12 * dt;
          wakeDisturbance = easeOutCubic(proximity);
        }
      }

      // Fade envelope: ease-out cube in, ease-in-out sine middle, ease-out fall.
      const t = mote.age / mote.life;
      const fadeIn = easeOutCubic(Math.min(1, t * 4));
      const fadeOut = 1 - easeOutCubic(Math.max(0, (t - 0.7) / 0.3));
      const breath = 0.85 + 0.15 * easeInOutSine((Math.sin(elapsed * 0.6 + i) + 1) * 0.5);
      const baseAlpha = Math.max(0, fadeIn * fadeOut * breath);
      // Disturbed motes briefly read brighter — like specks catching the sun
      // as they get knocked into a fresh light angle.
      const alpha = Math.min(1, baseAlpha * (1 + wakeDisturbance * wakeBrightness));

      // Color attribute (write per frame is fine for a 96-pool — micro-cost).
      colors[i * 3 + 0] = mote.color.r;
      colors[i * 3 + 1] = mote.color.g;
      colors[i * 3 + 2] = mote.color.b;
      sizes[i] = mote.size;

      if (additive) {
        alphasAdditive[i] = alpha * 0.85;
        alphasAlpha[i] = 0;
      } else {
        alphasAlpha[i] = alpha * 0.85;
        alphasAdditive[i] = 0;
      }

      _scratchMatrix.makeTranslation(mote.px, mote.py, mote.pz);
      meshAlpha.setMatrixAt(i, _scratchMatrix);
      meshAdditive.setMatrixAt(i, _scratchMatrix);
    }

    meshAlpha.instanceMatrix.needsUpdate = true;
    meshAdditive.instanceMatrix.needsUpdate = true;
    (geometryAlpha.attributes.aAlpha as InstancedBufferAttribute).needsUpdate = true;
    (geometryAdditive.attributes.aAlpha as InstancedBufferAttribute).needsUpdate = true;
    (geometryAlpha.attributes.aColor as InstancedBufferAttribute).needsUpdate = true;
    (geometryAdditive.attributes.aColor as InstancedBufferAttribute).needsUpdate = true;
    (geometryAlpha.attributes.aSize as InstancedBufferAttribute).needsUpdate = true;
    (geometryAdditive.attributes.aSize as InstancedBufferAttribute).needsUpdate = true;
  }

  function setVisible(visible: boolean) {
    group.visible = visible;
  }

  function dispose() {
    geometryAlpha.dispose();
    geometryAdditive.dispose();
    matAlpha.dispose();
    matAdditive.dispose();
  }

  return { group, update, setVisible, dispose };
}

export function defaultMoteBiomePalettes(): Record<BiomeZone, MoteBiomePalette> {
  // Read-only copy so external readers (contracts, debug HUD) can introspect.
  return { ...DEFAULT_BIOME_PALETTES };
}
