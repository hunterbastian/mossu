/**
 * Stylized open-water ocean.
 *
 * A single huge PlaneGeometry that follows the camera horizontally so the
 * player is always near the visible center; waves are anchored to world space
 * via the shader so they don't slide as the mesh shifts.
 *
 * Vertex: 7 layered Gerstner waves give a broad tropical swell plus smaller chop.
 * Fragment: rich-blue→turquoise→pale-cyan distance grade, cream/peach
 * horizon haze, fresnel rim with sky tint, sun specular, slope-aware breaker
 * foam on crests, and painterly shimmer.
 *
 * Sits below the floating sky island. Renders before everything else
 * (`renderOrder = -2`) so the depth buffer carves the island silhouette
 * out of the sea.
 */

import { Camera, Color, DirectionalLight, FrontSide, Mesh, PlaneGeometry, ShaderMaterial, Vector3 } from "three";

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
  farColor?: string;
  lagoonColor?: string;
  foamColor?: string;
  skyColor?: string;
  horizonColor?: string;
}

const VERT = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorldPos;
  varying float vWaveHeight;
  varying float vSwellSignal;
  varying float vCrestSignal;
  varying float vWaveSlope;
  varying float vTroughSignal;

  // Single Gerstner wave: returns (x, y, z) offset to add to the rest position.
  // Direction is the surface flow direction in XZ; wavelength sets crest spacing;
  // steepness ∈ [0..1] sharpens crests; speed scales the gravity-derived phase.
  vec3 gerstnerWave(
    vec2 dir,
    float wavelength,
    float steepness,
    float speed,
    float amplitudeScale,
    vec2 worldXZ,
    float t,
    out float crest,
    out float slope,
    out float trough
  ) {
    vec2 d = normalize(dir);
    float k = 6.2831853 / wavelength;            // wavenumber
    float c = sqrt(9.81 / k);                    // gravity wave phase speed
    float phase = k * (dot(d, worldXZ) - c * speed * t);
    float waveSin = sin(phase);
    float waveCos = cos(phase);
    float a = (steepness / k) * amplitudeScale;  // amplitude implied by steepness
    crest = smoothstep(0.34, 0.98, waveSin) * steepness;
    trough = smoothstep(0.1, 0.86, -waveSin) * steepness;
    slope = abs(waveCos) * steepness;
    return vec3(
      d.x * a * waveCos,
      a * waveSin,
      d.y * a * waveCos
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
    float crest = 0.0;
    float slope = 0.0;
    float trough = 0.0;
    float crestAccum = 0.0;
    float slopeAccum = 0.0;
    float troughAccum = 0.0;

    // Sea-of-thieves-like read: two large rolling swells, two crossing seas, two chop layers, and one glint layer.
    offset += gerstnerWave(vec2( 1.00,  0.20), 112.0, 0.74, 0.34, 1.0,  worldXZ, uTime, crest, slope, trough);
    crestAccum += crest * 0.34; slopeAccum += slope * 0.22; troughAccum += trough * 0.32;
    offset += gerstnerWave(vec2( 0.58, -0.74),  68.0, 0.62, 0.48, 0.88, worldXZ, uTime, crest, slope, trough);
    crestAccum += crest * 0.26; slopeAccum += slope * 0.2; troughAccum += trough * 0.22;
    offset += gerstnerWave(vec2(-0.46,  0.90),  38.0, 0.5,  0.68, 0.76, worldXZ, uTime, crest, slope, trough);
    crestAccum += crest * 0.18; slopeAccum += slope * 0.18; troughAccum += trough * 0.16;
    offset += gerstnerWave(vec2( 0.90,  0.44),  20.0, 0.36, 0.96, 0.56, worldXZ, uTime, crest, slope, trough);
    crestAccum += crest * 0.12; slopeAccum += slope * 0.16; troughAccum += trough * 0.1;
    offset += gerstnerWave(vec2(-0.74, -0.32),  10.5, 0.22, 1.34, 0.42, worldXZ, uTime, crest, slope, trough);
    crestAccum += crest * 0.07; slopeAccum += slope * 0.14; troughAccum += trough * 0.07;
    offset += gerstnerWave(vec2( 0.24,  0.97),   6.2, 0.14, 1.82, 0.32, worldXZ, uTime, crest, slope, trough);
    crestAccum += crest * 0.04; slopeAccum += slope * 0.08; troughAccum += trough * 0.04;
    offset += gerstnerWave(vec2(-0.08,  1.00),   3.7, 0.07, 2.32, 0.2,  worldXZ, uTime, crest, slope, trough);
    crestAccum += crest * 0.02; slopeAccum += slope * 0.04;

    // Apply offset in object space so the mesh's rotation transports it correctly.
    // Since we rotated -PI/2 around X, world Y is local Z, world Z is -local Y.
    // Easier: convert the world-space offset into object-space using the inverse
    // rotation: world (ox, oy, oz) → object (ox, -oz, oy).
    vec3 objectOffset = vec3(offset.x, -offset.z, offset.y);
    vec3 displaced = position + objectOffset;

    vec4 finalWorld = modelMatrix * vec4(displaced, 1.0);
    vWorldPos = finalWorld.xyz;
    vWaveHeight = offset.y;
    vCrestSignal = clamp(crestAccum, 0.0, 1.0);
    vWaveSlope = clamp(slopeAccum, 0.0, 1.0);
    vTroughSignal = clamp(troughAccum, 0.0, 1.0);
    vSwellSignal =
      sin(dot(normalize(vec2(1.0, 0.18)), worldXZ) * 0.083 - uTime * 0.46) * 0.54 +
      sin(dot(normalize(vec2(0.45, -0.85)), worldXZ) * 0.143 - uTime * 0.62) * 0.28 +
      sin(dot(normalize(vec2(-0.62, 0.78)), worldXZ) * 0.262 - uTime * 0.88) * 0.18;

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
  uniform vec3 uFarColor;
  uniform vec3 uLagoonColor;
  uniform vec3 uFoamColor;
  uniform vec3 uCameraWorld;
  varying vec3 vWorldPos;
  varying float vWaveHeight;
  varying float vSwellSignal;
  varying float vCrestSignal;
  varying float vWaveSlope;
  varying float vTroughSignal;

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

  float fbm2d(vec2 p) {
    float value = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i += 1) {
      value += noise2d(p) * amp;
      p = p * 2.03 + vec2(13.2, 7.7);
      amp *= 0.52;
    }
    return value;
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

    float dist = length(uCameraWorld - vWorldPos);
    float midDistance = smoothstep(360.0, 1550.0, dist);
    float farDistance = smoothstep(1350.0, 3400.0, dist);
    float horizonDistance = smoothstep(3100.0, 5000.0, dist);

    // Body color: distance sets the ocean grade; wave height adds local movement.
    float heightT = clamp(vWaveHeight * 0.065 + 0.5, 0.0, 1.0);
    float swellT = clamp(vSwellSignal * 0.5 + 0.5, 0.0, 1.0);
    vec3 distanceColor = mix(uDeepColor, uShallowColor, midDistance);
    distanceColor = mix(distanceColor, uFarColor, farDistance);
    float lagoonBand = (1.0 - farDistance) * smoothstep(0.16, 0.74, midDistance) * (1.0 - smoothstep(0.94, 1.0, midDistance));
    distanceColor = mix(distanceColor, uLagoonColor, lagoonBand * (0.4 + heightT * 0.18));
    vec3 waveTint = mix(vec3(-0.038, -0.012, 0.05), vec3(0.055, 0.086, 0.06), heightT);
    vec3 color = distanceColor + waveTint * (1.0 - farDistance * 0.58);
    color = mix(color, uDeepColor * vec3(0.78, 0.9, 1.02), (vTroughSignal * 0.24 + (1.0 - swellT) * 0.1) * (1.0 - farDistance));

    // Fresnel rim — fakes sky/horizon reflection at glancing angles
    float fresnel = pow(1.0 - ndotv, 4.0);
    vec3 skyTint = mix(uFarColor, uSkyColor, ndotv);
    color = mix(color, skyTint, fresnel * 0.72);

    // Sun specular — Sildur-inspired warm glint, kept stylized and broad.
    vec3 reflectDir = reflect(-uSunDir, normal);
    float spec = pow(max(dot(viewDir, reflectDir), 0.0), 64.0);
    color += uSunColor * spec * (0.78 + vWaveSlope * 0.52);

    vec2 sunFlat = normalize(uSunDir.xz + vec2(0.0001, -0.0001));
    vec2 cameraRay = normalize(vWorldPos.xz - uCameraWorld.xz + vec2(0.0001, 0.0001));
    float sunTrack = pow(max(dot(cameraRay, sunFlat), 0.0), 4.2);
    float shimmer = noise2d(vWorldPos.xz * 0.34 + uTime * 0.06);
    float sunThread = sin(dot(vWorldPos.xz, sunFlat) * 0.052 - uTime * 0.62 + shimmer * 2.2) * 0.5 + 0.5;
    float sunGlaze = smoothstep(0.52, 1.0, sunThread) * sunTrack * (0.05 + fresnel * 0.2) * (1.0 - farDistance * 0.46);
    color += mix(uSunColor, uHorizonColor, 0.24) * sunGlaze;

    // Foam: bright caps and long broken tropical lace lines like sunlit surf.
    float crest = max(smoothstep(2.0, 10.8, vWaveHeight), vCrestSignal * 0.86) * (0.62 + swellT * 0.38);
    float foamNoise = fbm2d(vWorldPos.xz * 0.028 + vec2(uTime * 0.026, -uTime * 0.018));
    float breakerEnergy = smoothstep(0.34, 0.9, vCrestSignal * 0.72 + vWaveSlope * 0.36 + foamNoise * 0.08);
    vec2 foamDirA = normalize(vec2(0.92, 0.28));
    vec2 foamDirB = normalize(vec2(-0.34, 0.94));
    float heroBreaker = smoothstep(0.72, 0.98, swellT + breakerEnergy * 0.16 + foamNoise * 0.1) * (1.0 - horizonDistance * 0.74);
    float longLineA = sin(dot(vWorldPos.xz, foamDirA) * 0.057 - uTime * 0.52 + foamNoise * 3.2) * 0.5 + 0.5;
    float longLineB = sin(dot(vWorldPos.xz, foamDirB) * 0.078 + uTime * 0.34 + foamNoise * 2.5) * 0.5 + 0.5;
    float windTear = smoothstep(0.7, 1.0, sin(dot(vWorldPos.xz, normalize(vec2(0.98, 0.12))) * 0.13 - uTime * 0.86 + foamNoise * 3.6) * 0.5 + 0.5);
    float foamLace =
      smoothstep(0.76, 0.98, longLineA + foamNoise * 0.2 + breakerEnergy * 0.05) * 0.56 +
      smoothstep(0.82, 1.0, longLineB + shimmer * 0.16) * 0.34 +
      windTear * breakerEnergy * 0.16;
    foamLace *= (0.18 + lagoonBand * 0.58 + crest * 0.46 + heroBreaker * 0.36) * (1.0 - horizonDistance * 0.66);
    float foamMask = smoothstep(0.58, 1.04, crest + breakerEnergy * 0.26 + shimmer * 0.2 + foamLace * 0.42);
    color = mix(color, uFoamColor, clamp(foamMask * 0.7 + foamLace * 0.58 + heroBreaker * crest * 0.3, 0.0, 0.94));

    float caustic = smoothstep(0.62, 0.98, fbm2d(vWorldPos.xz * 0.08 + vec2(uTime * 0.03, uTime * 0.018)));
    color += mix(vec3(0.0), vec3(0.18, 0.28, 0.18), caustic * lagoonBand * (1.0 - farDistance) * 0.24);

    // Body shimmer — subtle painterly variation everywhere
    float bodyNoise = noise2d(vWorldPos.xz * 0.62 + uTime * 0.13);
    color += (bodyNoise - 0.5) * 0.035;

    // Horizon fade — far ocean lifts from pale cyan into the cream/peach haze band.
    color = mix(color, uFarColor, farDistance * 0.18);
    color = mix(color, uHorizonColor, horizonDistance * horizonDistance * (0.38 + fresnel * 0.18));
    vec3 posterOcean = floor(color * 9.0 + 0.5) / 9.0;
    color = mix(color, posterOcean, 0.2);

    gl_FragColor = vec4(color, 1.0);
  }
`;

const _scratchSunDir = new Vector3();

export function buildOceanSystem(options: OceanOptions = {}): OceanSystem {
  const size = options.size ?? 8000;
  const subdivisions = options.subdivisions ?? 176;
  // Keep the sea below the underside shell so profile views read a clear air gap
  // before the floating island casts over open water.
  const level = options.level ?? -352;

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
      uSkyColor: { value: new Color(options.skyColor ?? "#bff6ff") },
      uHorizonColor: { value: new Color(options.horizonColor ?? "#eafff3") },
      uDeepColor: { value: new Color(options.deepColor ?? "#0063af") },
      uShallowColor: { value: new Color(options.shallowColor ?? "#12bfe4") },
      uFarColor: { value: new Color(options.farColor ?? "#a9f8f2") },
      uLagoonColor: { value: new Color(options.lagoonColor ?? "#39e5d0") },
      uFoamColor: { value: new Color(options.foamColor ?? "#fffdf3") },
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
