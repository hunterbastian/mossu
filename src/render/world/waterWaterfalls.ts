import { CircleGeometry, DoubleSide, Group, MathUtils, Mesh, MeshBasicMaterial, PlaneGeometry } from "three";
import { sampleTerrainHeight } from "../../simulation/world";
import { OOT_PS2_GRASSLANDS_PALETTE } from "../visualPalette";
import type { WaterRippleSource, WaterSurfaceController } from "./waterTypes";

const futureLakeArt = OOT_PS2_GRASSLANDS_PALETTE.futureLakes;

interface WaterfallAccent {
  group: Group;
  controller: WaterSurfaceController;
}

function makeWaterfallLayer(width: number, height: number, color: string, opacity: number, depth = 0) {
  const layer = new Mesh(
    new PlaneGeometry(width, height, 1, 8),
    new MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  layer.position.y = height * 0.5;
  layer.position.z = depth;
  layer.userData.baseOpacity = opacity;
  layer.userData.baseX = layer.position.x;
  layer.userData.baseY = layer.position.y;
  layer.userData.baseZ = depth;
  return layer;
}

function makeWaterfallFoamDisc(radius: number, color: string, opacity: number, x: number, z: number) {
  const foam = new Mesh(
    new CircleGeometry(radius, 18),
    new MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(x, 0.06, z);
  foam.scale.z = 0.42;
  foam.userData.baseOpacity = opacity;
  foam.userData.baseScaleX = foam.scale.x;
  foam.userData.baseScaleZ = foam.scale.z;
  return foam;
}

function makeWaterfallPanel(width: number, height: number, opacity: number, seed: number): WaterfallAccent {
  const group = new Group();
  group.userData.seed = seed;

  const veil = makeWaterfallLayer(width * 1.16, height, futureLakeArt.waterfallVeil, opacity * 0.78, -0.04);
  const blueCore = makeWaterfallLayer(width * 0.72, height * 0.96, futureLakeArt.waterfallCore, opacity * 0.64, 0.02);
  const whiteCore = makeWaterfallLayer(width * 0.42, height * 0.92, "#f8fff8", opacity * 0.74, 0.08);
  blueCore.position.x = Math.sin(seed * 1.7) * width * 0.08;
  whiteCore.position.x = Math.cos(seed * 1.2) * width * 0.08;
  group.add(veil, blueCore, whiteCore);

  const ribbons: Mesh[] = [];
  const ribbonCount = Math.max(5, Math.round(width * 1.28));
  for (let i = 0; i < ribbonCount; i += 1) {
    const t = ribbonCount === 1 ? 0.5 : i / (ribbonCount - 1);
    const lateral = MathUtils.lerp(-0.42, 0.42, t) * width + Math.sin(seed + i * 1.9) * width * 0.08;
    const ribbonWidth = width * MathUtils.lerp(0.08, 0.16, (Math.sin(seed * 2.1 + i) + 1) * 0.5);
    const ribbonHeight = height * MathUtils.lerp(0.34, 0.62, (Math.cos(seed + i * 2.4) + 1) * 0.5);
    const ribbon = makeWaterfallLayer(
      ribbonWidth,
      ribbonHeight,
      i % 2 === 0 ? "#ffffff" : "#dff8ff",
      opacity * 0.76,
      0.16 + i * 0.012,
    );
    ribbon.position.x = lateral;
    ribbon.userData.baseX = lateral;
    ribbon.userData.fallSpeed = 0.34 + i * 0.055;
    ribbon.userData.phase = (seed * 0.31 + i * 0.23) % 1;
    ribbons.push(ribbon);
    group.add(ribbon);
  }

  const foamA = makeWaterfallFoamDisc(width * 0.62, futureLakeArt.foam, opacity * 1.24, -width * 0.16, 0.36);
  const foamB = makeWaterfallFoamDisc(width * 0.46, futureLakeArt.foamCool, opacity * 0.88, width * 0.24, 0.52);
  const foamC = makeWaterfallFoamDisc(width * 0.34, futureLakeArt.waterfallSunFoam, opacity * 0.48, width * 0.02, 0.68);
  group.add(foamA, foamB, foamC);

  const spray: Mesh[] = [];
  for (let i = 0; i < 10; i += 1) {
    const sprayPuff = new Mesh(
      new CircleGeometry(width * MathUtils.lerp(0.055, 0.12, (Math.sin(seed + i) + 1) * 0.5), 12),
      new MeshBasicMaterial({
        color: i % 3 === 0 ? "#fff4d3" : "#ecfbff",
        transparent: true,
        opacity: opacity * MathUtils.lerp(0.34, 0.68, (Math.cos(seed + i * 1.6) + 1) * 0.5),
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    sprayPuff.position.set(
      Math.sin(seed * 0.7 + i * 1.3) * width * 0.58,
      height * MathUtils.lerp(0.05, 0.34, (i % 4) / 3),
      0.24 + i * 0.035,
    );
    sprayPuff.userData.baseX = sprayPuff.position.x;
    sprayPuff.userData.baseY = sprayPuff.position.y;
    sprayPuff.userData.baseOpacity = (sprayPuff.material as MeshBasicMaterial).opacity;
    sprayPuff.userData.phase = seed * 0.4 + i;
    spray.push(sprayPuff);
    group.add(sprayPuff);
  }

  const controller: WaterSurfaceController = {
    mesh: veil,
    update(elapsed: number, _ripples: readonly WaterRippleSource[] = [], mapLookdown = false) {
      const mapFade = mapLookdown ? 0.6 : 1;
      [veil, blueCore, whiteCore].forEach((layer, index) => {
        const material = layer.material as MeshBasicMaterial;
        const baseOpacity = (layer.userData.baseOpacity as number | undefined) ?? opacity;
        const baseZ = (layer.userData.baseZ as number | undefined) ?? layer.position.z;
        material.opacity = baseOpacity * mapFade * (0.86 + Math.sin(elapsed * (1.1 + index * 0.34) + seed) * 0.14);
        layer.position.z = baseZ + Math.sin(elapsed * 0.7 + index + seed) * 0.025;
      });

      ribbons.forEach((ribbon, index) => {
        const material = ribbon.material as MeshBasicMaterial;
        const baseOpacity = (ribbon.userData.baseOpacity as number | undefined) ?? opacity;
        const speed = (ribbon.userData.fallSpeed as number | undefined) ?? 0.42;
        const phase = (ribbon.userData.phase as number | undefined) ?? 0;
        const cycle = (elapsed * speed + phase) % 1;
        ribbon.position.y = height * (0.9 - cycle * 0.58);
        ribbon.position.x =
          ((ribbon.userData.baseX as number | undefined) ?? ribbon.position.x) +
          Math.sin(elapsed * 1.7 + index + seed) * width * 0.025;
        material.opacity = baseOpacity * mapFade * (0.58 + Math.sin(cycle * Math.PI) * 0.42);
      });

      [foamA, foamB, foamC].forEach((foam, index) => {
        const material = foam.material as MeshBasicMaterial;
        const baseOpacity = (foam.userData.baseOpacity as number | undefined) ?? opacity;
        const pulse = 0.88 + Math.sin(elapsed * (1.4 + index * 0.32) + seed) * 0.12;
        foam.scale.x = ((foam.userData.baseScaleX as number | undefined) ?? 1) * pulse;
        foam.scale.z = ((foam.userData.baseScaleZ as number | undefined) ?? 0.42) * (1.08 - (pulse - 0.88));
        material.opacity = baseOpacity * mapFade * pulse;
      });

      spray.forEach((puff, index) => {
        const material = puff.material as MeshBasicMaterial;
        const phase = (puff.userData.phase as number | undefined) ?? index;
        puff.position.x =
          ((puff.userData.baseX as number | undefined) ?? 0) + Math.sin(elapsed * 0.9 + phase) * width * 0.08;
        puff.position.y = ((puff.userData.baseY as number | undefined) ?? 0) + Math.sin(elapsed * 1.2 + phase) * 0.12;
        material.opacity =
          ((puff.userData.baseOpacity as number | undefined) ?? opacity * 0.4) *
          mapFade *
          (0.72 + Math.sin(elapsed * 1.6 + phase) * 0.28);
      });
    },
  };

  return { group, controller };
}

export function addSmallWaterfall(
  group: Group,
  controllers: WaterSurfaceController[],
  x: number,
  z: number,
  width: number,
  height: number,
  yaw: number,
  opacity = 0.34,
) {
  const waterfall = makeWaterfallPanel(width, height, opacity, x * 0.17 + z * 0.09);
  waterfall.group.position.set(x, sampleTerrainHeight(x, z) - height * 0.18, z);
  waterfall.group.rotation.y = yaw;
  waterfall.group.rotation.z = Math.sin(x * 0.13 + z * 0.07) * 0.05;
  waterfall.group.name = `pretty-waterfall-${Math.round(x)}-${Math.round(z)}`;
  group.add(waterfall.group);
  controllers.push(waterfall.controller);
}
