import {
  BufferAttribute,
  Color,
  Float32BufferAttribute,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
} from "three";
import {
  MOSSU_PLAYFIELD_EXTENT,
  sampleBiomeTransitionOpen,
  sampleBiomeZone,
  sampleHabitatLayer,
  sampleIslandEdgeFactor,
  samplePaintedGroundMask,
  sampleRiverDampBankMask,
  sampleRouteReadabilityClearing,
  sampleRouteDirtPathMask,
  sampleStartingWaterDampBankMask,
  sampleStartingWaterWetness,
  sampleTerrainHeight,
  sampleTerrainNormal,
  sampleWaterBankShape,
  sampleWorldRegion,
} from "../../simulation/world";
import { OOT_PS2_GRASSLANDS_PALETTE } from "../visualPalette";
import { getPainterlyTextureSet } from "./painterlyTextures";
import { sampleOpeningMeadowMask } from "./worldMasks";

const WORLD_SIZE = MOSSU_PLAYFIELD_EXTENT;
const TERRAIN_SEGMENTS = 192;
const terrainArt = OOT_PS2_GRASSLANDS_PALETTE.terrain;

function ovalMask(x: number, z: number, centerX: number, centerZ: number, radiusX: number, radiusZ: number) {
  return Math.exp(-(((x - centerX) / radiusX) ** 2) - (((z - centerZ) / radiusZ) ** 2));
}

function colorForTerrain(x: number, y: number, z: number) {
  const zone = sampleBiomeZone(x, z, y);
  const habitat = sampleHabitatLayer(x, z, y);
  const worldRegion = sampleWorldRegion(x, z, y);
  const islandEdge = sampleIslandEdgeFactor(x, z);
  const normal = sampleTerrainNormal(x, z);
  const slope = 1 - normal.y;
  const painterlyNoise = Math.sin(x * 0.07) * 0.04 + Math.cos(z * 0.05) * 0.03 + Math.sin((x - z) * 0.03) * 0.05;
  const microWafer = Math.sin(x * 0.037 - z * 0.029) * 0.5 + 0.5;
  const microFine = Math.sin(x * 0.091 + z * 0.073) * Math.cos(x * 0.044 - z * 0.051) * 0.5 + 0.5;
  const microBreakup = MathUtils.clamp(microWafer * 0.45 + microFine * 0.38 + painterlyNoise * 0.5, 0, 1);
  const patch = Math.round((Math.sin(x * 0.12 + z * 0.08) * 0.5 + 0.5) * 5) / 5;
  const mixValue = MathUtils.clamp(patch * 0.5 + microBreakup * 0.22 + painterlyNoise + y / 220, 0, 1);
  const northSilhouette = MathUtils.clamp(MathUtils.smoothstep(z, 8, 168), 0, 1);
  const journeyNorth = MathUtils.clamp(MathUtils.smoothstep(z, -40, 200), 0, 1);
  const openingMask = sampleOpeningMeadowMask(x, z);
  const riverDampBank = sampleRiverDampBankMask(x, z);
  const startingWaterDampBank = sampleStartingWaterDampBankMask(x, z);
  const startingWaterWetness = sampleStartingWaterWetness(x, z);
  const bankShape = sampleWaterBankShape(x, z);
  const waterShoreMask = MathUtils.clamp(riverDampBank + startingWaterDampBank + startingWaterWetness * 0.18 + bankShape.dampBand * 0.42, 0, 1);
  const wetBankLine = MathUtils.clamp(riverDampBank * 0.72 + startingWaterDampBank * 0.8 + bankShape.dampBand * 0.72, 0, 1);
  const dryLipLine = MathUtils.clamp((riverDampBank + startingWaterDampBank) * (1 - startingWaterWetness * 0.25) + bankShape.dryLip * 0.8 - slope * 0.28, 0, 1);
  const sandbarLine = MathUtils.clamp(bankShape.sandbarLift * 0.86 + bankShape.pebbleBand * 0.28, 0, 1);
  const coveShade = MathUtils.clamp(bankShape.coveCut * 0.64 + bankShape.shelfCut * 0.28, 0, 1);
  const paintedGround = samplePaintedGroundMask(x, z) * (1 - waterShoreMask * 0.42);
  const routeDirt = sampleRouteDirtPathMask(x, z);
  const routeClearing = sampleRouteReadabilityClearing(x, z);
  const biomeTransitionOpen = sampleBiomeTransitionOpen(x, z, y);
  const sunWash = Math.sin(x * 0.018 - z * 0.014 + 1.2) * 0.5 + 0.5;
  const fieldBands = Math.sin(x * 0.022 + z * 0.006 - 1.2) * 0.5 + 0.5;
  const pathBands = Math.sin(x * 0.052 + z * 0.018 + 0.8) * 0.5 + 0.5;
  const meadowBloom = MathUtils.clamp((1 - slope * 2.8) * (0.04 + sunWash * 0.1 + openingMask * 0.08), 0, 0.18);
  const heightGrass = MathUtils.clamp(MathUtils.smoothstep(y, 8, 82), 0, 1);
  const foothillTint = MathUtils.clamp(MathUtils.smoothstep(y, 38, 98), 0, 1);
  const alpineTint = MathUtils.clamp(MathUtils.smoothstep(y, 84, 148), 0, 1);
  const foothillTravelBand = Math.exp(-(((x - 18) / 134) ** 2) - (((z - 106) / 108) ** 2));
  const ridgeTravelBand = Math.exp(-(((x + 2) / 144) ** 2) - (((z - 178) / 118) ** 2));
  const scenicTravelBand = MathUtils.clamp(
    Math.max(foothillTravelBand, ridgeTravelBand) + routeClearing * 0.38 + biomeTransitionOpen * 0.28,
    0,
    1,
  );
  // Reads as soft painted terrace bands on hills: it is terrain-height/slope based, not a texture lookup.
  const highlandSlopeBands = MathUtils.clamp(
    (Math.sin(x * 0.034 + z * 0.018 + y * 0.006) * 0.5 + 0.5) *
      MathUtils.clamp(slope * 1.7 + foothillTint * 0.36 + alpineTint * 0.24, 0, 1) *
      (1 - routeDirt * 0.5),
    0,
    1,
  );
  const routeShoulderBloom = MathUtils.clamp(
    routeClearing * (1 - routeDirt) * MathUtils.smoothstep(y, 20, 118) * (0.42 + fieldBands * 0.36),
    0,
    1,
  );
  const meadowFlowerBand = MathUtils.clamp(
    (Math.sin(x * 0.048 - z * 0.033 + 1.6) * 0.5 + 0.5) *
      habitat.meadow *
      MathUtils.clamp(1 - slope * 2.4, 0, 1) *
      (0.34 + openingMask * 0.62 + scenicTravelBand * 0.12),
    0,
    1,
  );
  const codexDeepWoods = Math.max(
    ovalMask(x, z, -122, -66, 52, 58),
    ovalMask(x, z, 94, 22, 56, 64),
    ovalMask(x, z, 54, 96, 50, 54),
  );
  const codexPeacefulGroves = Math.max(
    ovalMask(x, z, -88, -112, 66, 48),
    ovalMask(x, z, 108, -34, 62, 54),
    ovalMask(x, z, -26, 76, 58, 50),
  );
  const codexAncientGrounds = Math.max(
    ovalMask(x, z, -90, 132, 58, 58),
    ovalMask(x, z, 84, 148, 62, 62),
  );
  const codexWoodlandPath = Math.max(
    ovalMask(x, z, -34, 84, 68, 52),
    ovalMask(x, z, 42, 124, 66, 58),
  );
  const canopyDapple = MathUtils.clamp(
    (Math.sin(x * 0.14 + z * 0.05) * Math.cos(z * 0.12 - x * 0.04) * 0.5 + 0.5) *
    Math.max(codexDeepWoods, codexPeacefulGroves, codexAncientGrounds, codexWoodlandPath * 0.86) *
    (1 - routeClearing * 0.38),
    0,
    1,
  );
  const slopeRock = MathUtils.smoothstep(slope, 0.12, 0.6);
  const cliffSilhouette = MathUtils.clamp(northSilhouette * MathUtils.smoothstep(slope, 0.18, 0.55), 0, 0.24);
  const altitudeRock = MathUtils.smoothstep(y, 54, 132) * 0.34;
  const zoneRockBoost =
    zone === "foothills" ? 0.18 :
    zone === "alpine" ? 0.42 :
    zone === "ridge" ? 0.58 :
    zone === "peak_shrine" ? 0.6 :
    0;
  const routeRockCarve = routeClearing * (0.12 + scenicTravelBand * 0.08);
  const rockMask = MathUtils.clamp(slopeRock + altitudeRock + zoneRockBoost + cliffSilhouette - routeRockCarve, 0, 0.96);
  const snowBase =
    MathUtils.smoothstep(y, 118, 166) * 0.9 +
    MathUtils.smoothstep(z, 170, 232) * 0.3 +
    (zone === "peak_shrine" ? 0.38 : 0) +
    (zone === "ridge" ? 0.24 : 0);
  const rockSnowDampen = 1 - MathUtils.clamp(rockMask * 0.55, 0, 0.45);
  const snowMask = MathUtils.clamp(snowBase * rockSnowDampen * (1 - routeClearing * 0.22), 0, 0.92);
  const grasslandsArtDirection = MathUtils.clamp(
    (1 - journeyNorth * 0.48) *
      (
        habitat.meadow * 0.54 +
        openingMask * 0.5 +
        scenicTravelBand * 0.3 +
        biomeTransitionOpen * 0.16 +
        (zone === "plains" || zone === "hills" ? 0.24 : 0)
      ),
    0,
    1,
  );
  const grass = new Color(terrainArt.grassBase)
    .lerp(new Color(terrainArt.grassLush), 0.48 + mixValue * 0.26 + heightGrass * 0.1)
    .lerp(new Color(terrainArt.meadowYellowGreen), openingMask * (0.18 + fieldBands * 0.24) + meadowBloom * 1.22)
    .lerp(new Color(terrainArt.warmSun), grasslandsArtDirection * (0.08 + sunWash * 0.08 + fieldBands * 0.06))
    .lerp(new Color(terrainArt.travelWarm), scenicTravelBand * (0.06 + sunWash * 0.06) * (1 - alpineTint * 0.45))
    .lerp(new Color(terrainArt.groveSunlitFloor), codexPeacefulGroves * (0.16 + canopyDapple * 0.12))
    .lerp(new Color(terrainArt.forestDeepFloor), codexDeepWoods * (0.22 + (1 - canopyDapple) * 0.12))
    .lerp(new Color(terrainArt.ancientMossFloor), codexAncientGrounds * 0.2)
    .lerp(new Color(terrainArt.forestDeepFloor), codexWoodlandPath * (0.1 + canopyDapple * 0.08) * (1 - routeClearing * 0.42))
    .lerp(new Color(terrainArt.forestDappleWarm), canopyDapple * 0.08 * (1 - codexDeepWoods * 0.38))
    .lerp(new Color(terrainArt.foothillGreen), foothillTint * 0.2)
    .lerp(new Color(terrainArt.alpineSage), alpineTint * 0.22)
    .lerp(new Color(terrainArt.formSlope), highlandSlopeBands * 0.07)
    .lerp(new Color(terrainArt.formWarm), routeShoulderBloom * 0.06)
    .lerp(new Color(terrainArt.microDark), microBreakup * 0.045)
    .lerp(new Color(terrainArt.microLight), (1 - microFine) * 0.08 * (1 - northSilhouette * 0.5))
    .lerp(new Color(terrainArt.northernGrey), journeyNorth * 0.1 + northSilhouette * 0.08);
  const wildflowerPunch = MathUtils.clamp(
    habitat.meadow * (1 - rockMask) * microWafer * (0.32 + grasslandsArtDirection * 0.32 + meadowFlowerBand * 0.34),
    0,
    0.13,
  );
  grass.lerp(new Color(terrainArt.wildflower), wildflowerPunch);
  const zoneGreenRead =
    zone === "plains" ? { lerp: new Color(terrainArt.zonePlains), w: 0.2 } :
    zone === "hills" ? { lerp: new Color(terrainArt.zoneHills), w: 0.2 } :
    zone === "foothills" ? { lerp: new Color(terrainArt.zoneFoothills), w: 0.22 } :
    zone === "alpine" ? { lerp: new Color(terrainArt.zoneAlpine), w: 0.28 } :
    zone === "ridge" ? { lerp: new Color(terrainArt.zoneRidge), w: 0.26 } :
    zone === "peak_shrine" ? { lerp: new Color(terrainArt.zonePeakShrine), w: 0.22 } :
    { lerp: grass, w: 0 };
  if (zoneGreenRead.w > 0) {
    grass.lerp(zoneGreenRead.lerp, zoneGreenRead.w * (1 - biomeTransitionOpen * 0.42));
  }
  const zoneSplatB = MathUtils.clamp(
    Math.sin(x * 0.026 - z * 0.034) * Math.cos(x * 0.019 + z * 0.027) * 0.5 + 0.5,
    0,
    1,
  );
  grass.lerp(new Color(terrainArt.zoneSplatDark), zoneSplatB * 0.035);
  grass.lerp(new Color(terrainArt.zoneBreakupLight), (1 - zoneSplatB) * microBreakup * (0.06 + grasslandsArtDirection * 0.04));
  const rock = new Color(terrainArt.rockBase)
    .lerp(new Color(terrainArt.rockLight), 0.18 + mixValue * 0.22)
    .lerp(new Color(terrainArt.rockSlope), MathUtils.clamp(slope * 1.22 + alpineTint * 0.4, 0, 0.82))
    .lerp(new Color(terrainArt.rockTravel), MathUtils.clamp(scenicTravelBand * 0.18 + routeClearing * 0.12, 0, 0.24));
  const snow = new Color(terrainArt.snowBase).lerp(new Color(terrainArt.snowCool), MathUtils.clamp(slope * 0.8 + painterlyNoise * 1.6, 0, 0.48));
  const paintedEarth = new Color(terrainArt.paintedEarthBase)
    .lerp(new Color(terrainArt.paintedEarthWarm), MathUtils.clamp(0.3 + pathBands * 0.3 + openingMask * 0.18, 0, 1))
    .lerp(new Color(terrainArt.paintedEarthHigh), foothillTint * 0.2 + alpineTint * 0.18)
    .lerp(new Color(terrainArt.dryLipEarth), dryLipLine * 0.2);
  const sandbar = new Color(terrainArt.sandbarBase)
    .lerp(new Color(terrainArt.sandbarWarm), MathUtils.clamp(0.24 + sunWash * 0.22 + pathBands * 0.14, 0, 1))
    .lerp(new Color(terrainArt.sandbarCool), foothillTint * 0.16 + alpineTint * 0.22);
  const wornDirt = new Color(terrainArt.wornDirt)
    .lerp(new Color(terrainArt.wornDirtWarm), 0.38 + fieldBands * 0.24)
    .lerp(new Color(terrainArt.wornDirtDark), 0.08 + slope * 0.08);

  const terrainColor = grass
    .lerp(new Color(terrainArt.meadowTerrain), habitat.meadow * (0.24 + openingMask * 0.16))
    .lerp(new Color(terrainArt.forestTerrain), habitat.forest * 0.17)
    .lerp(new Color(terrainArt.shoreTerrain), habitat.shore * 0.14)
    .lerp(paintedEarth, paintedGround * (0.42 + (1 - slopeRock) * 0.24))
    .lerp(
      wornDirt,
      routeDirt * (0.42 + MathUtils.clamp(journeyNorth * 0.08 + scenicTravelBand * 0.1, 0, 0.14)) * (1 - rockMask * 0.86),
    )
    .lerp(sandbar, sandbarLine * 0.34)
    .lerp(new Color(terrainArt.wetBank), wetBankLine * 0.16)
    .lerp(new Color(terrainArt.coveShade), coveShade * 0.06)
    .lerp(new Color(terrainArt.shorelineRead), waterShoreMask * 0.1)
    .lerp(new Color(terrainArt.dryLipTerrain), dryLipLine * 0.15)
    .lerp(new Color(terrainArt.forestDeepFloor), codexDeepWoods * habitat.forest * 0.16)
    .lerp(new Color(terrainArt.groveSunlitFloor), codexPeacefulGroves * habitat.clearing * 0.14)
    .lerp(new Color(terrainArt.ancientMossFloor), codexAncientGrounds * 0.14)
    .lerp(new Color(terrainArt.meadowBloom), meadowBloom * (0.44 + openingMask * 0.26))
    .lerp(new Color(terrainArt.scenicTravel), scenicTravelBand * 0.18 * (1 - rockMask))
    .lerp(new Color(terrainArt.artDirectionLift), grasslandsArtDirection * 0.12 * (1 - rockMask))
    .lerp(rock, rockMask * (0.74 + alpineTint * 0.18) * (1 - snowMask * 0.46))
    .lerp(snow, snowMask)
    .lerp(new Color("#ead098"), worldRegion.shore * 0.22 * (1 - snowMask))
    .lerp(new Color("#2f6c43"), worldRegion.forest * 0.12 * (1 - routeClearing * 0.28))
    .lerp(new Color("#8da34d"), worldRegion.highland * 0.13 * (1 - rockMask * 0.28))
    .lerp(new Color("#8d8067"), worldRegion.ridge * 0.18 * (1 - snowMask * 0.4))
    .lerp(new Color("#a9c86e"), worldRegion.shrine * 0.16);
  const islandHeart = (1 - MathUtils.clamp(islandEdge, 0, 1)) ** 1.2;
  let out = new Color(terrainColor).lerp(
    new Color(terrainArt.islandHeart),
    islandHeart * 0.1 * (1 - snowMask * 0.45),
  );
  const islandRimMask = MathUtils.clamp((islandEdge - 0.36) * 1.05, 0, 1)
    * (1 - MathUtils.smoothstep(0.88, 0.99, islandEdge));
  out = out.lerp(new Color(terrainArt.islandRim), islandRimMask * 0.12 * (1 - snowMask * 0.55));
  out = out.lerp(new Color("#f0df94"), MathUtils.clamp(grasslandsArtDirection * 0.06 + meadowBloom * 0.12, 0, 0.1));
  out.offsetHSL(0, -0.025, 0.035 * (1 - snowMask * 0.7));
  const luma = out.r * 0.2126 + out.g * 0.7152 + out.b * 0.0722;
  const lumaFloor = MathUtils.clamp(0.48 + grasslandsArtDirection * 0.08 + worldRegion.meadow * 0.04 - snowMask * 0.08, 0.42, 0.58);
  out = out.lerp(new Color("#cedb86"), MathUtils.clamp((lumaFloor - luma) * 2.7, 0, 0.58));
  return out.lerp(new Color(terrainArt.islandEdgeMist), MathUtils.smoothstep(islandEdge, 0.74, 1) * 0.74);
}

export function makeTerrainMesh() {
  const geometry = new PlaneGeometry(WORLD_SIZE, WORLD_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
  geometry.rotateX(-Math.PI / 2);

  const positions = geometry.attributes.position as BufferAttribute;
  const colors = new Float32Array(positions.count * 3);
  const edgeFactors = new Float32Array(positions.count);
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const y = sampleTerrainHeight(x, z);
    positions.setY(i, y);
    edgeFactors[i] = sampleIslandEdgeFactor(x, z);
    const color = colorForTerrain(x, y, z);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  const index = geometry.getIndex();
  if (index) {
    const trimmedIndices: number[] = [];
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i);
      const b = index.getX(i + 1);
      const c = index.getX(i + 2);
      if (Math.min(edgeFactors[a], edgeFactors[b], edgeFactors[c]) < 0.998) {
        trimmedIndices.push(a, b, c);
      }
    }
    geometry.setIndex(trimmedIndices);
  }

  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const painterlyTextures = getPainterlyTextureSet();
  const material = new MeshBasicMaterial({
    map: painterlyTextures.terrainDetail,
    vertexColors: true,
    dithering: true,
    fog: true,
  });
  material.userData.painterlyTextureSet = "runtime-generated";

  const mesh = new Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}

export function buildTerrainFormStrokes() {
  const disabled = new Object3D();
  disabled.name = "terrain-form-strokes";
  return disabled;
}
