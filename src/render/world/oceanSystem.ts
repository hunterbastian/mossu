/**
 * Stylized open-water ocean.
 *
 * A single huge PlaneGeometry that follows the camera horizontally so the
 * player is always near the visible center; waves are anchored to world space
 * via the shader so they don't slide as the mesh shifts.
 *
 * Vertex: 5 layered Gerstner waves give that rolling pirate-ocean motion.
 * Fragment: deep→turquoise gradient by wave height, fresnel rim with sky
 * tint, sun specular, foam on crests, painterly shimmer, horizon fade.
 *
 * Sits below the floating sky island. Renders before everything else
 * (`renderOrder = -2`) so the depth buffer carves the island silhouette
 * out of the sea.
 */

import {
  Camera,
  Color,
  DirectionalLight,
  FrontSide,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
} from "three";

export interface OceanSystem {
  readonly mesh: Mesh;
  update(elapsed: number, sun: DirectionalLight, camera: Camera): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

export interface OceanOptions {
  /** Edge length of the ocean plane in world units. */
  size?: number;
  /** Vertex grid resolution per side (more = finer waves, more triangles). */
  subdivisions?: number;
  /** Sea level Y in world units. The island terrain should sit above this. */
  level?: number;
  /** Painterly tone overrides. */
  deepColor?: string;
  shallowColor?: string;
  foamColor?: string;
  skyColor?: string;
  horizonColor?: string;
}

const VERT = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorldPos;
  varying float vWaveHeight;

  // Single Gerstner wave: returns (x, y, z) offset to add to the rest position.
  // Direction is the surface flow direction in XZ; wavelength sets crest spacing;
  // steepness ∈ [0..1] sharpens crests; speed scales the gravity-derived phase.
  vec3 gerstnerWave(vec2 dir, float wavelength, float steepness, float speed, vec2 worldXZ, float t) {
    vec2 d = normalize(dir);
    float k = 6.2831853 / wavelength;            // wavenumber
    float c = sqrt(9.81 / k);                    // gravity wave phase speed
    float phase = k * (dot(d, worldXZ) - c * speed * t);
    float a = steepness / k;                     // amplitude implied by steepness
    return vec3(
      d.x * a * cos(phase),
      a * sin(phase),
      d.y * a * cos(phase)
    );
  }

  void main() {
    // Mesh is rotated -PI/2 around X so the plane lies on the world XZ ground plane.
    // Local position (x, y, 0) maps to world (x, level, -y) after the rotation.
    // Use the model matrix for the world XZ — that way waves stay anchored to the
    // world even when the mesh follows the camera horizontally.
    vec4 worldPos4 = modelMatrix * vec4(position, 1.0);
    vec2 worldXZ = worldPos4.xz;

    vec3 offset = vec3(0.0);
    // 5 waves: 2 long+slow rolling swells, 2 mid chop, 1 small detail
    offset += gerstnerWave(vec2( 1.00,  0.20), 36.0, 0.60, 0.6, worldXZ, uTime);
    offset += gerstnerWave(vec2( 0.45, -0.85), 24.0, 0.50, 0.85, worldXZ, uTime);
    offset += gerstnerWave(vec2(-0.62,  0.78), 14.0, 0.42, 1.1, worldXZ, uTime);
    offset += gerstnerWave(vec2( 0.92,  0.40),  8.0, 0.30, 1.5, worldXZ, uTime);
    offset += gerstnerWave(vec2(-0.74, -0.32),  4.5, 0.18, 2.2, worldXZ, uTime);

    // Apply offset in object space so the mesh's rotation transports it correctly.
    // Since we rotated -PI/2 around X, world Y is local Z, world Z is -local Y.
    // Easier: convert the world-space offset into object-space using the inverse
    // rotation: world (ox, oy, oz) → object (ox, -oz, oy).
    vec3 objectOffset = vec3(offset.x, -offset.z, offset.y);
    vec3 displaced = position + objectOffset;

    vec4 finalWorld = modelMatrix * vec4(displaced, 1.0);
    vWorldPos = finalWorld.xyz;
    vWaveHeight = offset.y;

    gl_Position = projectionMatrix * viewMatrix * finalWorld;
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uSkyColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uDeepColor;
  uniform vec3 uShallowColor;
  uniform vec3 uFoamColor;
  uniform vec3 uCameraWorld;
  varying vec3 vWorldPos;
  varying float vWaveHeight;

  float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise2d(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  void main() {
    // Geometric normal from screen-space derivatives — cheap, matches the
    // tessellated wave surface, no need to redo Gerstner partials in fragment.
    vec3 dx = dFdx(vWorldPos);
    vec3 dy = dFdy(vWorldPos);
    vec3 normal = normalize(cross(dx, dy));
    if (normal.y < 0.0) normal = -normal;

    vec3 viewDir = normalize(uCameraWorld - vWorldPos);
    float ndotv = clamp(dot(normal, viewDir), 0.0, 1.0);

    // Body color: trough → crest reads as deep blue → turquoise
    float heightT = clamp(vWaveHeight * 0.55 + 0.5, 0.0, 1.0);
    vec3 color = mix(uDeepColor, uShallowColor, heightT);

    // Fresnel rim — fakes sky/horizon reflection at glancing angles
    float fresnel = pow(1.0 - ndotv, 4.0);
    vec3 skyTint = mix(uHorizonColor, uSkyColor, ndotv);
    color = mix(color, skyTint, fresnel * 0.72);

    // Sun specular — sharp, small bright glint
    vec3 reflectDir = reflect(-uSunDir, normal);
    float spec = pow(max(dot(viewDir, reflectDir), 0.0), 90.0);
    color += uSunColor * spec * 0.95;

    // Foam: bright caps on tall wave crests, broken up by shimmer noise
    float crest = smoothstep(0.5, 1.1, vWaveHeight);
    float shimmer = noise2d(vWorldPos.xz * 0.34 + uTime * 0.06);
    float foamMask = smoothstep(0.55, 1.0, crest + shimmer * 0.28);
    color = mix(color, uFoamColor, foamMask);

    // Body shimmer — subtle painterly variation everywhere
    float bodyNoise = noise2d(vWorldPos.xz * 0.62 + uTime * 0.13);
    color += (bodyNoise - 0.5) * 0.05;

    // Distance fade — far ocean blends into horizon for a clean sea-meets-sky read
    float dist = length(uCameraWorld - vWorldPos);
    float horizonFade = clamp(dist / 4200.0, 0.0, 1.0);
    color = mix(color, uHorizonColor, horizonFade * horizonFade * 0.62);

    gl_FragColor = vec4(color, 1.0);
  }
`;

const _scratchSunDir = new Vector3();

export function buildOceanSystem(options: OceanOptions = {}): OceanSystem {
  const size = options.size ?? 8000;
  const subdivisions = options.subdivisions ?? 200;
  // Mossu's island shell extends down to ~y=-305 (lowerBelly bottom). Ocean sits
  // below that so the cliff/underbelly emerges from the sea cleanly.
  const level = options.level ?? -340;

  const geometry = new PlaneGeometry(size, size, subdivisions, subdivisions);

  const material = new ShaderMaterial({
    transparent: false,
    depthWrite: true,
    side: FrontSide,
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: new Vector3(0.4, 0.7, 0.3).normalize() },
      uSunColor: { value: new Color(0xfff1c8) },
      uSkyColor: { value: new Color(options.skyColor ?? "#9bdff5") },
      uHorizonColor: { value: new Color(options.horizonColor ?? "#faeed8") },
      uDeepColor: { value: new Color(options.deepColor ?? "#0c3a55") },
      uShallowColor: { value: new Color(options.shallowColor ?? "#44b8c7") },
      uFoamColor: { value: new Color(options.foamColor ?? "#faffff") },
      uCameraWorld: { value: new Vector3() },
    },
  });

  const mesh = new Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = level;
  mesh.frustumCulled = false;
  mesh.renderOrder = -2;
  mesh.name = "ocean-sea";
  mesh.matrixAutoUpdate = true;

  function update(elapsed: number, sun: DirectionalLight, camera: Camera) {
    material.uniforms.uTime.value = elapsed;
    material.uniforms.uSunColor.value.copy(sun.color);
    _scratchSunDir.subVectors(sun.position, sun.target.position).normalize();
    material.uniforms.uSunDir.value.copy(_scratchSunDir);
    material.uniforms.uCameraWorld.value.copy(camera.position);
    // Anchor the plane to the camera horizontally; waves stay world-anchored
    // via the shader's modelMatrix lookup, so the surface scrolls invisibly.
    mesh.position.x = camera.position.x;
    mesh.position.z = camera.position.z;
  }

  function setVisible(visible: boolean) {
    mesh.visible = visible;
  }

  function dispose() {
    geometry.dispose();
    material.dispose();
  }

  return { mesh, update, setVisible, dispose };
}
