import { Vector3 } from "three";
import type {
  BiomeThresholdLandmark,
  ScenicPocket,
  ShadowPocket,
  WorldForageable,
  WorldLandmark,
  WorldMapMarker,
} from "./worldTypes";

type TerrainHeightSampler = (x: number, z: number) => number;
type RiverCenterSampler = (z: number) => number;

interface WorldContentContext {
  sampleTerrainHeight: TerrainHeightSampler;
  sampleRiverCenter: RiverCenterSampler;
  startingNestGroundPosition: Vector3;
  forageableInteractionRadius: number;
}

export function buildWorldLandmarks({
  sampleTerrainHeight,
  sampleRiverCenter,
  startingNestGroundPosition,
}: WorldContentContext): WorldLandmark[] {
  return [
    {
      id: "start-burrow",
      type: "burrow",
      position: startingNestGroundPosition.clone(),
      title: "Burrow Hollow",
      flavorPing: "The hillside nest still hums with the memory of first shelter.",
      interactionRadius: 16,
      inventoryEntry: {
        title: "Moss Quilt Scrap",
        summary:
          "A warm scrap of burrow lining. Mossu keeps it to remember the first hollow that made the floating island feel safe.",
      },
    },
    {
      id: "orange-tree-overlook",
      type: "lone_tree",
      position: new Vector3(-4, sampleTerrainHeight(-4, -38), -38),
      title: "Amber Tree Knoll",
      flavorPing: "Sun pools here; the meadow opens below.",
      interactionRadius: 15,
      inventoryEntry: {
        title: "Amber Seed",
        summary:
          "A smooth orange seed tucked under the lone tree. It smells sun-warm and marks the first open lookout above the meadow.",
      },
    },
    {
      id: "river-bend",
      type: "river_bend",
      position: new Vector3(sampleRiverCenter(24), sampleTerrainHeight(sampleRiverCenter(24), 24), 24),
      title: "Silver Bend",
      flavorPing: "The river slows and gathers light.",
      interactionRadius: 15,
      inventoryEntry: {
        title: "River Glass",
        summary:
          "A polished shard of pale blue glass from the bend. It catches the same color as the calmer water channels below the pass.",
      },
    },
    {
      id: "fir-gate",
      type: "pass",
      position: new Vector3(24, sampleTerrainHeight(24, 88), 88),
      title: "Fir Gate",
      flavorPing: "Fir shade begins; the climb finds its rhythm.",
      interactionRadius: 15,
      inventoryEntry: {
        title: "Fir Tassel",
        summary:
          "A tassel of soft fir needles tied with grass. Mossu keeps it as a marker for the point where the gentle hills start turning into a climb.",
      },
    },
    {
      id: "foothill-pass",
      type: "pass",
      position: new Vector3(20, sampleTerrainHeight(20, 108), 108),
      title: "Whisper Pass",
      flavorPing: "The wind tugs toward the high shelves.",
      interactionRadius: 15,
      inventoryEntry: {
        title: "Pass Thread",
        summary:
          "A braided trail thread caught on a stone lip. It feels like a reminder to keep following the river wind toward the high shelves.",
      },
    },
    {
      id: "highland-basin",
      type: "cliff_path",
      position: new Vector3(42, sampleTerrainHeight(42, 134), 134),
      title: "Highland Basin",
      flavorPing: "Spray and cold air collect around the highland stones.",
      interactionRadius: 15,
      inventoryEntry: {
        title: "Basin Vial",
        summary:
          "A tiny glass vial beaded with basin spray. The satchel note says the air starts tasting colder here, even before the ridge proper.",
      },
    },
    {
      id: "windstep-shelf",
      type: "cliff_path",
      position: new Vector3(10, sampleTerrainHeight(10, 154), 154),
      title: "Windstep Shelf",
      flavorPing: "Updrafts braid along the shelf stones.",
      interactionRadius: 15,
      inventoryEntry: {
        title: "Shelf Chime",
        summary:
          "A bent ribbon chime that hums whenever the updraft hits it. Mossu files it away as proof that the airy route is real.",
      },
    },
    {
      id: "ridge-overlook",
      type: "overlook",
      position: new Vector3(-26, sampleTerrainHeight(-26, 168), 168),
      title: "Cloudback Ridge",
      flavorPing: "Cloudback spills open to the sky.",
      interactionRadius: 15,
      inventoryEntry: {
        title: "Cloudback Feather",
        summary:
          "A long pale feather caught against the overlook rocks. It turns the ridge from a destination into a place worth lingering in.",
      },
    },
    {
      id: "skyward-ledge",
      type: "overlook",
      position: new Vector3(6, sampleTerrainHeight(6, 178), 178),
      title: "Skyward Ledge",
      flavorPing: "The wind opens wide here, and the world drops toward the valley below.",
      interactionRadius: 16,
      inventoryEntry: {
        title: "Skyward Moss Strand",
        summary:
          "A silver-tipped strand of cliff moss found along the ledge lip. It marks the moment the route turns into real overhead air.",
      },
    },
    {
      id: "ridge-saddle-landmark",
      type: "cliff_path",
      position: new Vector3(16, sampleTerrainHeight(16, 186), 186),
      title: "Ridge Saddle",
      flavorPing: "Alpine lichen marks the seam before the crown.",
      interactionRadius: 15,
      inventoryEntry: {
        title: "Lichen Knot",
        summary:
          "A springy knot of alpine lichen. It feels like something gathered from the seam between the last traverse and the shrine approach.",
      },
    },
    {
      id: "peak-shrine",
      type: "ridge_shrine",
      position: new Vector3(18, sampleTerrainHeight(18, 214), 214),
      title: "Moss Crown Shrine",
      flavorPing: "The crown waits—soft moss on sunlit stone.",
      interactionRadius: 18,
      inventoryEntry: {
        title: "Shrine Crown Moss",
        summary:
          "A bright crown of moss from the summit stones. Mossu tucks it away like a soft proof that the climb actually happened.",
      },
    },
  ];
}

export function buildWorldMapMarkers({
  sampleTerrainHeight,
  sampleRiverCenter,
  startingNestGroundPosition,
}: WorldContentContext): readonly WorldMapMarker[] {
  return [
    {
      id: "bridge-meadow-planks",
      kind: "bridge",
      title: "Meadow Planks",
      position: new Vector3(sampleRiverCenter(-54), sampleTerrainHeight(sampleRiverCenter(-54), -54), -54),
    },
    {
      id: "bridge-silver-bend",
      kind: "bridge",
      title: "Silver Bend Bridge",
      position: new Vector3(sampleRiverCenter(26), sampleTerrainHeight(sampleRiverCenter(26), 26), 26),
      landmarkId: "river-bend",
    },
    {
      id: "bridge-fir-gate",
      kind: "bridge",
      title: "Fir Gate Bridge",
      position: new Vector3(sampleRiverCenter(92), sampleTerrainHeight(sampleRiverCenter(92), 92), 92),
      landmarkId: "fir-gate",
    },
    {
      id: "poi-burrow",
      kind: "poi",
      title: "Burrow Hollow",
      position: startingNestGroundPosition.clone(),
      landmarkId: "start-burrow",
    },
    {
      id: "poi-fir-gate",
      kind: "poi",
      title: "Fir Gate",
      position: new Vector3(24, sampleTerrainHeight(24, 88), 88),
      landmarkId: "fir-gate",
    },
    {
      id: "poi-cloudback",
      kind: "poi",
      title: "Cloudback Ridge",
      position: new Vector3(-26, sampleTerrainHeight(-26, 168), 168),
      landmarkId: "ridge-overlook",
    },
    {
      id: "special-amber-tree",
      kind: "special",
      title: "Amber Tree",
      position: new Vector3(-4, sampleTerrainHeight(-4, -38), -38),
      landmarkId: "orange-tree-overlook",
    },
    {
      id: "special-highland-basin",
      kind: "special",
      title: "Highland Basin",
      position: new Vector3(42, sampleTerrainHeight(42, 134), 134),
      landmarkId: "highland-basin",
    },
    {
      id: "special-moss-crown",
      kind: "special",
      title: "Moss Crown",
      position: new Vector3(18, sampleTerrainHeight(18, 214), 214),
      landmarkId: "peak-shrine",
    },
  ] as const;
}

export function buildWorldForageables({
  sampleTerrainHeight,
  sampleRiverCenter,
  forageableInteractionRadius,
}: WorldContentContext): WorldForageable[] {
  return [
    {
      id: "meadow-seed-pouch",
      kind: "seed",
      position: new Vector3(-61, sampleTerrainHeight(-61, -154), -154),
      title: "Meadow Seeds",
      summary: "A tiny pinch of round meadow seeds, warm from the trailhead grass.",
      interactionRadius: forageableInteractionRadius,
    },
    {
      id: "lake-shell",
      kind: "shell",
      position: new Vector3(-50, sampleTerrainHeight(-50, -126), -126),
      title: "Lake Shell",
      summary: "A pearl-white shell from the soft lake edge. It clicks gently in Mossu's pouch.",
      interactionRadius: forageableInteractionRadius,
    },
    {
      id: "amber-berries",
      kind: "berry",
      position: new Vector3(-12, sampleTerrainHeight(-12, -30), -30),
      title: "Amber Berries",
      summary: "A bright berry cluster from the sunny meadow below the lone tree.",
      interactionRadius: forageableInteractionRadius,
    },
    {
      id: "river-smooth-stone",
      kind: "smooth_stone",
      position: new Vector3(sampleRiverCenter(18) - 5, sampleTerrainHeight(sampleRiverCenter(18) - 5, 18), 18),
      title: "Smooth River Stone",
      summary: "A cool oval stone from the quiet bend, polished by shallow water.",
      interactionRadius: forageableInteractionRadius,
    },
    {
      id: "moss-hollow-tuft",
      kind: "moss_tuft",
      position: new Vector3(28, sampleTerrainHeight(28, 92), 92),
      title: "Moss Tuft",
      summary: "A springy green tuft from the first fir shade at the climb.",
      interactionRadius: forageableInteractionRadius,
    },
    {
      id: "fir-seeds",
      kind: "seed",
      position: new Vector3(16, sampleTerrainHeight(16, 112), 112),
      title: "Fir Seeds",
      summary: "Small winged fir seeds gathered where the foothill breeze starts turning cold.",
      interactionRadius: forageableInteractionRadius,
    },
    {
      id: "highland-shell-chip",
      kind: "shell",
      position: new Vector3(34, sampleTerrainHeight(34, 128), 128),
      title: "Highland Shell Chip",
      summary: "A thin shell chip lifted from the spray around the highland runoff stones.",
      interactionRadius: forageableInteractionRadius,
    },
    {
      id: "wind-shelf-feather",
      kind: "feather",
      position: new Vector3(12, sampleTerrainHeight(12, 156), 156),
      title: "Wind-Shelf Feather",
      summary: "A pale high-shelf feather with a faint updraft chill.",
      interactionRadius: forageableInteractionRadius,
    },
    {
      id: "cloudberries",
      kind: "berry",
      position: new Vector3(-30, sampleTerrainHeight(-30, 168), 168),
      title: "Cloudberries",
      summary: "A soft ridge berry cluster that grows where the air feels thin and bright.",
      interactionRadius: forageableInteractionRadius,
    },
    {
      id: "ridge-pocket-stone",
      kind: "smooth_stone",
      position: new Vector3(20, sampleTerrainHeight(20, 184), 184),
      title: "Ridge Pocket Stone",
      summary: "A flat blue-gray stone from the seam between the final ridge and the shrine approach.",
      interactionRadius: forageableInteractionRadius,
    },
    {
      id: "shrine-moss",
      kind: "moss_tuft",
      position: new Vector3(0, sampleTerrainHeight(0, 206), 206),
      title: "Shrine Moss",
      summary: "A tiny crown of summit moss that smells like rain on old stone.",
      interactionRadius: forageableInteractionRadius,
    },
    {
      id: "overlook-feather",
      kind: "feather",
      position: new Vector3(-22, sampleTerrainHeight(-22, 194), 194),
      title: "Overlook Feather",
      summary: "A long cream feather caught against the overlook rocks.",
      interactionRadius: forageableInteractionRadius,
    },
  ];
}

export function buildShadowPockets({ sampleTerrainHeight }: WorldContentContext): ShadowPocket[] {
  return [
    {
      id: "pocket-burrow",
      position: new Vector3(-44, sampleTerrainHeight(-44, -134) + 0.3, -134),
      radius: 13,
      depth: 8,
      hue: 0.62,
    },
    {
      id: "pocket-ravine",
      position: new Vector3(-58, sampleTerrainHeight(-58, 56) + 0.3, 56),
      radius: 8,
      depth: 6,
      hue: 0.63,
    },
    {
      id: "pocket-cave",
      position: new Vector3(38, sampleTerrainHeight(38, 128) + 0.2, 128),
      radius: 12,
      depth: 7,
      hue: 0.6,
    },
    {
      id: "pocket-shrine",
      position: new Vector3(2, sampleTerrainHeight(2, 210) + 0.2, 210),
      radius: 10,
      depth: 5,
      hue: 0.58,
    },
  ];
}

export function buildScenicPockets({
  sampleTerrainHeight,
  sampleRiverCenter,
}: WorldContentContext): ScenicPocket[] {
  return [
    {
      id: "start-meadow",
      kind: "meadow_clearing",
      zone: "plains",
      position: new Vector3(-62, sampleTerrainHeight(-62, -150), -150),
      radius: 34,
    },
    {
      id: "great-lake-shore",
      kind: "stream_bend",
      zone: "plains",
      position: new Vector3(-116, sampleTerrainHeight(-116, -116), -116),
      radius: 38,
    },
    {
      id: "burrow-bloom",
      kind: "moss_hollow",
      zone: "plains",
      position: new Vector3(-46, sampleTerrainHeight(-46, -132), -132),
      radius: 18,
    },
    {
      id: "amber-tree-meadow",
      kind: "meadow_clearing",
      zone: "hills",
      position: new Vector3(-8, sampleTerrainHeight(-8, -34), -34),
      radius: 30,
    },
    {
      id: "silver-creek-meadow",
      kind: "stream_bend",
      zone: "hills",
      position: new Vector3(-42, sampleTerrainHeight(-42, 34), 34),
      radius: 26,
    },
    {
      id: "silver-bend-bank",
      kind: "stream_bend",
      zone: "hills",
      position: new Vector3(sampleRiverCenter(22), sampleTerrainHeight(sampleRiverCenter(22), 22), 22),
      radius: 22,
    },
    {
      id: "whisper-pass-ledge",
      kind: "overlook",
      zone: "foothills",
      position: new Vector3(20, sampleTerrainHeight(20, 106), 106),
      radius: 20,
    },
    {
      id: "fir-gate-entry",
      kind: "meadow_clearing",
      zone: "foothills",
      position: new Vector3(24, sampleTerrainHeight(24, 88), 88),
      radius: 18,
    },
    {
      id: "highland-cascade",
      kind: "stream_bend",
      zone: "alpine",
      position: new Vector3(34, sampleTerrainHeight(34, 126), 126),
      radius: 18,
    },
    {
      id: "highland-basin",
      kind: "stream_bend",
      zone: "alpine",
      position: new Vector3(42, sampleTerrainHeight(42, 134), 134),
      radius: 20,
    },
    {
      id: "fir-glen-hollow",
      kind: "moss_hollow",
      zone: "alpine",
      position: new Vector3(-12, sampleTerrainHeight(-12, 144), 144),
      radius: 18,
    },
    {
      id: "windstep-shelf",
      kind: "overlook",
      zone: "alpine",
      position: new Vector3(10, sampleTerrainHeight(10, 154), 154),
      radius: 22,
    },
    {
      id: "aspen-ledge",
      kind: "overlook",
      zone: "alpine",
      position: new Vector3(-6, sampleTerrainHeight(-6, 160), 160),
      radius: 18,
    },
    {
      id: "cloudback-overlook",
      kind: "overlook",
      zone: "ridge",
      position: new Vector3(-28, sampleTerrainHeight(-28, 166), 166),
      radius: 24,
    },
    {
      id: "skyward-ledge-rim",
      kind: "overlook",
      zone: "ridge",
      position: new Vector3(6, sampleTerrainHeight(6, 178), 178),
      radius: 24,
    },
    {
      id: "ridge-saddle",
      kind: "moss_hollow",
      zone: "ridge",
      position: new Vector3(18, sampleTerrainHeight(18, 184), 184),
      radius: 16,
    },
    {
      id: "ridge-crossing",
      kind: "overlook",
      zone: "ridge",
      position: new Vector3(10, sampleTerrainHeight(10, 194), 194),
      radius: 22,
    },
    {
      id: "shrine-approach",
      kind: "overlook",
      zone: "peak_shrine",
      position: new Vector3(8, sampleTerrainHeight(8, 208), 208),
      radius: 18,
    },
  ];
}

export function buildBiomeThresholdLandmarks({
  sampleTerrainHeight,
}: WorldContentContext): BiomeThresholdLandmark[] {
  return [
    {
      id: "meadow-cusp-cairn",
      fromZone: "plains",
      toZone: "hills",
      position: new Vector3(-12, sampleTerrainHeight(-12, -8), -8),
      kind: "moss_cairn",
      clearingRadius: 22,
      clearingStrength: 0.62,
    },
    {
      id: "fir-gate-sentinel",
      fromZone: "hills",
      toZone: "foothills",
      position: new Vector3(28, sampleTerrainHeight(28, 84), 84),
      kind: "hero_pine",
      clearingRadius: 28,
      clearingStrength: 0.78,
    },
    {
      id: "alpine-cusp-cairn",
      fromZone: "foothills",
      toZone: "alpine",
      position: new Vector3(36, sampleTerrainHeight(36, 95), 95),
      kind: "stone_cairn",
      clearingRadius: 26,
      clearingStrength: 0.72,
    },
    {
      id: "windstep-sentinel",
      fromZone: "alpine",
      toZone: "ridge",
      position: new Vector3(14, sampleTerrainHeight(14, 115), 115),
      kind: "wind_pine",
      clearingRadius: 30,
      clearingStrength: 0.74,
    },
    {
      id: "shrine-approach-cairn",
      fromZone: "ridge",
      toZone: "peak_shrine",
      position: new Vector3(8, sampleTerrainHeight(8, 204), 204),
      kind: "prayer_cairn",
      clearingRadius: 28,
      clearingStrength: 0.78,
    },
  ];
}
