import { BufferAttribute, BufferGeometry, Color, ShaderMaterial, Vector3 } from "three";

export function buildAtlasOceanMaterial() {
  return new ShaderMaterial({
    depthWrite: true,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uCameraWorld: { value: new Vector3() },
      uNearColor: { value: new Color("#0064b2") },
      uMidColor: { value: new Color("#13bfe4") },
      uLagoonColor: { value: new Color("#3be6d0") },
      uFarColor: { value: new Color("#a7f8f1") },
      uHorizonColor: { value: new Color("#eafff3") },
      uMistHazeColor: { value: new Color("#dffcef") },
      uFoamColor: { value: new Color("#efffff") },
    },
    vertexShader: `
      uniform float uTime;
      varying vec3 vWorldPosition;
      varying float vWaveHeight;
      varying float vCrestSignal;
      varying float vWaveSlope;

      vec3 atlasWave(vec2 dir, float wavelength, float steepness, float speed, float amplitudeScale, vec2 worldXZ, float t, out float crest, out float slope) {
        vec2 d = normalize(dir);
        float k = 6.2831853 / wavelength;
        float c = sqrt(9.81 / k);
        float phase = k * (dot(d, worldXZ) - c * speed * t);
        float waveSin = sin(phase);
        float waveCos = cos(phase);
        float a = (steepness / k) * amplitudeScale;
        crest = smoothstep(0.34, 0.98, waveSin) * steepness;
        slope = abs(waveCos) * steepness;
        return vec3(d.x * a * waveCos, a * waveSin, d.y * a * waveCos);
      }

      void main() {
        vec4 baseWorldPosition = modelMatrix * vec4(position, 1.0);
        vec2 worldXZ = baseWorldPosition.xz;
        float crest = 0.0;
        float slope = 0.0;
        float crestAccum = 0.0;
        float slopeAccum = 0.0;
        vec3 offset = vec3(0.0);
        offset += atlasWave(vec2(1.0, 0.2), 112.0, 0.74, 0.34, 0.82, worldXZ, uTime, crest, slope);
        crestAccum += crest * 0.42;
        slopeAccum += slope * 0.32;
        offset += atlasWave(vec2(0.58, -0.74), 68.0, 0.62, 0.48, 0.62, worldXZ, uTime, crest, slope);
        crestAccum += crest * 0.28;
        slopeAccum += slope * 0.26;
        offset += atlasWave(vec2(-0.46, 0.9), 38.0, 0.5, 0.68, 0.5, worldXZ, uTime, crest, slope);
        crestAccum += crest * 0.2;
        slopeAccum += slope * 0.22;
        offset += atlasWave(vec2(0.9, 0.44), 20.0, 0.34, 0.96, 0.34, worldXZ, uTime, crest, slope);
        crestAccum += crest * 0.1;
        slopeAccum += slope * 0.16;
        vec3 objectOffset = vec3(offset.x, -offset.z, offset.y);
        vec3 displaced = position + objectOffset;
        vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
        vWorldPosition = worldPosition.xyz;
        vWaveHeight = offset.y;
        vCrestSignal = clamp(crestAccum, 0.0, 1.0);
        vWaveSlope = clamp(slopeAccum, 0.0, 1.0);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uCameraWorld;
      uniform vec3 uNearColor;
      uniform vec3 uMidColor;
      uniform vec3 uLagoonColor;
      uniform vec3 uFarColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uMistHazeColor;
      uniform vec3 uFoamColor;
      varying vec3 vWorldPosition;
      varying float vWaveHeight;
      varying float vCrestSignal;
      varying float vWaveSlope;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float fbm(vec2 p) {
        float value = 0.0;
        float amp = 0.5;
        for (int i = 0; i < 4; i += 1) {
          value += noise(p) * amp;
          p = p * 2.03 + vec2(11.4, 6.8);
          amp *= 0.52;
        }
        return value;
      }

      void main() {
        float dist = length(uCameraWorld - vWorldPosition);
        float midFade = smoothstep(280.0, 1080.0, dist);
        float farFade = smoothstep(920.0, 2180.0, dist);
        float horizonFade = smoothstep(1750.0, 3100.0, dist);
        vec3 viewRay = normalize(vWorldPosition - uCameraWorld);
        float grazingMist = smoothstep(-0.22, -0.015, viewRay.y);
        float lowerDepth = smoothstep(-330.0, -120.0, -vWorldPosition.y);
        float wave = noise(vWorldPosition.xz * 0.018 + vec2(uTime * 0.018, -uTime * 0.012));
        float detail = fbm(vWorldPosition.xz * 0.036 + vec2(uTime * 0.024, -uTime * 0.018));
        float lagoonBand = (1.0 - farFade) * smoothstep(0.18, 0.74, midFade) * (1.0 - smoothstep(0.92, 1.0, midFade));
        vec3 color = mix(uNearColor, uMidColor, midFade);
        color = mix(color, uFarColor, farFade * 0.92);
        color = mix(color, uLagoonColor, lagoonBand * (0.42 + detail * 0.18));
        color = mix(color, uNearColor, lowerDepth * 0.12 * (1.0 - farFade * 0.66));
        color = mix(color, uNearColor * vec3(0.78, 0.92, 1.04), smoothstep(-9.0, -1.5, vWaveHeight) * 0.16 * (1.0 - farFade));
        color += (wave - 0.5) * 0.024 + vWaveHeight * 0.003;
        color = mix(color, uFarColor, grazingMist * 0.34 * (1.0 - horizonFade * 0.45));
        color = mix(color, uHorizonColor, horizonFade * (0.24 + grazingMist * 0.18));
        float creamMist = smoothstep(0.5, 1.0, horizonFade) * grazingMist;
        color = mix(color, uMistHazeColor, creamMist * 0.26);
        vec2 foamDirA = normalize(vec2(0.92, 0.28));
        vec2 foamDirB = normalize(vec2(-0.36, 0.94));
        float breaker = smoothstep(0.34, 0.92, vCrestSignal * 0.76 + vWaveSlope * 0.28 + detail * 0.08);
        float foamLineA = sin(dot(vWorldPosition.xz, foamDirA) * 0.058 - uTime * 0.46 + detail * 2.7) * 0.5 + 0.5;
        float foamLineB = sin(dot(vWorldPosition.xz, foamDirB) * 0.078 + uTime * 0.28 + wave * 2.4) * 0.5 + 0.5;
        float windTear = smoothstep(0.72, 1.0, sin(dot(vWorldPosition.xz, normalize(vec2(0.98, 0.12))) * 0.13 - uTime * 0.74 + detail * 3.2) * 0.5 + 0.5);
        float softFoam =
          smoothstep(0.74, 0.98, wave) * 0.1 +
          breaker * 0.14 +
          smoothstep(0.8, 1.0, foamLineA + detail * 0.2 + breaker * 0.06) * lagoonBand * 0.34 +
          smoothstep(0.84, 1.0, foamLineB + wave * 0.12) * lagoonBand * 0.2 +
          windTear * breaker * 0.11;
        color = mix(color, uFoamColor, softFoam * (1.0 - horizonFade * 0.62));
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
}

export function buildAtlasOceanDiscGeometry(radius: number, radialSegments: number, rings: number) {
  const positions: number[] = [0, 0, 0];
  const uvs: number[] = [0.5, 0.5];
  const indices: number[] = [];
  const segmentCount = Math.max(24, radialSegments);
  const ringCount = Math.max(2, rings);
  const ringVertexCount = segmentCount + 1;

  for (let ring = 1; ring <= ringCount; ring += 1) {
    const ringT = ring / ringCount;
    const ringRadius = radius * ringT;
    for (let segment = 0; segment <= segmentCount; segment += 1) {
      const angle = (segment / segmentCount) * Math.PI * 2;
      const x = Math.cos(angle) * ringRadius;
      const y = Math.sin(angle) * ringRadius;
      positions.push(x, y, 0);
      uvs.push(0.5 + Math.cos(angle) * ringT * 0.5, 0.5 + Math.sin(angle) * ringT * 0.5);
    }
  }

  for (let segment = 0; segment < segmentCount; segment += 1) {
    indices.push(0, 1 + segment, 1 + segment + 1);
  }

  for (let ring = 1; ring < ringCount; ring += 1) {
    const ringStart = 1 + (ring - 1) * ringVertexCount;
    const nextRingStart = ringStart + ringVertexCount;
    for (let segment = 0; segment < segmentCount; segment += 1) {
      const a = ringStart + segment;
      const b = nextRingStart + segment;
      const c = nextRingStart + segment + 1;
      const d = ringStart + segment + 1;
      indices.push(a, b, d, b, c, d);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
