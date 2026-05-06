import { CylinderGeometry, Group, Mesh, MeshBasicMaterial, SphereGeometry } from "three";

export interface MapMarker {
  group: Group;
  baseScale: number;
  pulseSpeed: number;
}

export function createMapMarker(color: string, radius: number, height: number, opacity: number) {
  const group = new Group();
  const ringMaterial = new MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
  });
  const coreMaterial = new MeshBasicMaterial({
    color,
    transparent: true,
    opacity: opacity * 0.78,
    depthWrite: false,
  });

  const ring = new Mesh(new CylinderGeometry(radius, radius, 0.18, 24), ringMaterial);
  ring.position.y = 0.1;
  const core = new Mesh(new CylinderGeometry(radius * 0.42, radius * 0.42, height, 18), coreMaterial);
  core.position.y = height * 0.5;
  const cap = new Mesh(new SphereGeometry(radius * 0.3, 12, 10), coreMaterial);
  cap.position.y = height + radius * 0.12;
  group.add(ring, core, cap);
  return group;
}
