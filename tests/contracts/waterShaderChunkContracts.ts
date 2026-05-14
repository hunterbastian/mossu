import { MeshBasicMaterial } from "three";
import type { GrassShader } from "../../src/render/world/grassSystem";
import { WATER_PROFILES } from "../../src/render/world/waterProfiles";
import { createWaterRippleRingFunction, createWaterWaveUniformDeclarations } from "../../src/render/world/waterShaderChunks";
import { createSharedWaterWaveUniforms } from "../../src/render/world/waterShaderUniforms";
import { createWaterSurfaceColors } from "../../src/render/world/waterSurfaceColors";
import { configureWaterFillShader } from "../../src/render/world/waterFillShader";
import { configureWaterSurfaceShader } from "../../src/render/world/waterSurfaceShader";
import { configureWaterVolumeShader } from "../../src/render/world/waterVolumeShader";
import { assert, assertEqual } from "./testHarness";

function countOccurrences(source: string, needle: string) {
  return source.split(needle).length - 1;
}

function makeShader(): GrassShader {
  return {
    uniforms: {},
    vertexShader: `
      #include <common>
      #include <uv_vertex>
      #include <begin_vertex>
      #include <project_vertex>
    `,
    fragmentShader: `
      #include <common>
      vec4 diffuseColor = vec4( diffuse, opacity );
    `,
  } as unknown as GrassShader;
}

function compileMaterialShader(material: MeshBasicMaterial, shader: GrassShader) {
  (material.onBeforeCompile as unknown as (shader: GrassShader) => void)(shader);
}

export function runWaterShaderChunkContracts() {
  const declarations = createWaterWaveUniformDeclarations();
  assert(declarations.includes("uniform float uBaseFrequency;"), "wave chunk declares base frequency");
  assert(declarations.includes("uniform float uDetailFrequency;"), "wave chunk declares detail frequency");
  assertEqual(countOccurrences(declarations, "uniform float uBaseFrequency;"), 1, "wave chunk declares base frequency once");
  assertEqual(
    countOccurrences(declarations, "uniform float uDetailFrequency;"),
    1,
    "wave chunk declares detail frequency once",
  );

  const surfaceRipple = createWaterRippleRingFunction("waterRippleRing", true);
  const volumeRipple = createWaterRippleRingFunction("waterRippleRingVolume", false);
  assert(surfaceRipple.includes("float waterRippleRing("), "surface ripple chunk uses requested function name");
  assert(surfaceRipple.includes("wakeCore"), "surface ripple chunk includes wake core");
  assert(volumeRipple.includes("float waterRippleRingVolume("), "volume ripple chunk uses requested function name");
  assert(!volumeRipple.includes("wakeCore"), "volume ripple chunk keeps wake core disabled");

  const profile = WATER_PROFILES.mainRiver;
  const colors = createWaterSurfaceColors(profile);
  const uniforms = createSharedWaterWaveUniforms(profile, { profile, width: 5 }, 1);

  const surfaceMaterial = new MeshBasicMaterial();
  const surfaceShader = makeShader();
  configureWaterSurfaceShader(surfaceMaterial, uniforms, colors, profile);
  compileMaterialShader(surfaceMaterial, surfaceShader);
  assertEqual(
    countOccurrences(surfaceShader.fragmentShader, "uniform float uBaseFrequency;"),
    1,
    "surface fragment declares base frequency once",
  );
  assertEqual(
    countOccurrences(surfaceShader.fragmentShader, "uniform float uDetailFrequency;"),
    1,
    "surface fragment declares detail frequency once",
  );

  const fillMaterial = new MeshBasicMaterial();
  const fillShader = makeShader();
  configureWaterFillShader(fillMaterial, uniforms, colors, profile);
  compileMaterialShader(fillMaterial, fillShader);
  assertEqual(
    countOccurrences(fillShader.vertexShader, "uniform float uBaseFrequency;"),
    1,
    "fill vertex declares base frequency once",
  );

  const volumeMaterial = new MeshBasicMaterial();
  const volumeShader = makeShader();
  configureWaterVolumeShader(volumeMaterial, uniforms, colors, profile);
  compileMaterialShader(volumeMaterial, volumeShader);
  assertEqual(
    countOccurrences(volumeShader.vertexShader, "uniform float uDetailFrequency;"),
    1,
    "volume vertex declares detail frequency once",
  );
}
