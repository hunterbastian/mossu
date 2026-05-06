import { CircleGeometry, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, SphereGeometry } from "three";
import type { CoopRemoteMossuState } from "../../simulation/coopStress";

export interface RemoteMossuVisual {
  group: Group;
  body: Mesh;
  tuft: Mesh;
  state: CoopRemoteMossuState;
  baseScale: number;
  bobOffset: number;
}

export function createRemoteMossuVisual(index: number, state: CoopRemoteMossuState): RemoteMossuVisual {
  const group = new Group();
  group.name = `coop-stress-${state.id}`;
  const palette = state.colors;
  const bodyMaterial = new MeshLambertMaterial({
    color: palette.body,
    emissive: palette.emissive,
    emissiveIntensity: 0.08,
  });
  const tuftMaterial = new MeshLambertMaterial({
    color: palette.tuft,
    emissive: palette.emissive,
    emissiveIntensity: 0.05,
  });
  const eyeMaterial = new MeshBasicMaterial({ color: "#253a42" });
  const glowMaterial = new MeshBasicMaterial({
    color: palette.glow,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });

  const glow = new Mesh(new CircleGeometry(1.35, 18), glowMaterial);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.04;

  const body = new Mesh(new SphereGeometry(0.92, 14, 10), bodyMaterial);
  body.position.y = 1.02;
  body.scale.set(1.1, 0.86, 1);

  const tuft = new Mesh(new SphereGeometry(0.34, 10, 8), tuftMaterial);
  tuft.position.set(0, 1.78, -0.06);
  tuft.scale.set(1.18, 0.66, 0.95);

  const eyeLeft = new Mesh(new SphereGeometry(0.075, 8, 6), eyeMaterial);
  eyeLeft.position.set(-0.28, 1.08, -0.78);
  const eyeRight = eyeLeft.clone();
  eyeRight.position.x = 0.28;

  group.add(glow, body, tuft, eyeLeft, eyeRight);
  return {
    group,
    body,
    tuft,
    state,
    baseScale: Math.max(0.62, 0.82 - index * 0.04),
    bobOffset: index * 1.73,
  };
}
