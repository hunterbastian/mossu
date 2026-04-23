import {
  IcosahedronGeometry,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Quaternion,
  Vector3,
} from "three";
import { PlayerState } from "../../simulation/gameState";

export class MossuAvatar {
  readonly group = new Group();

  private readonly locomotionRoot = new Group();
  private readonly rollingRoot = new Group();
  private readonly legRoot = new Group();
  private readonly faceAnchor = new Group();
  private readonly body: Mesh;
  private readonly fluff: Mesh[] = [];
  private readonly topTufts: Mesh[] = [];
  private readonly eyeMeshes: Mesh[] = [];
  private readonly cheekMeshes: Mesh[] = [];
  private readonly legs: Mesh[] = [];
  private readonly bodyMaterial: MeshStandardMaterial;
  private readonly localVelocity = new Vector3();
  private readonly rollAxis = new Vector3();
  private readonly upAxis = new Vector3(0, 1, 0);
  private readonly rollQuat = new Quaternion();
  private readonly identityQuat = new Quaternion();
  private bob = 0;
  private stepCycle = 0;
  private rollBlend = 0;
  private readonly radius = 2.2;

  constructor() {
    this.group.add(this.locomotionRoot);
    this.locomotionRoot.add(this.rollingRoot);
    this.locomotionRoot.add(this.legRoot);

    const bodyGeometry = new IcosahedronGeometry(this.radius, 5);
    this.bodyMaterial = new MeshStandardMaterial({
      color: "#f4f8fb",
      roughness: 0.96,
      metalness: 0,
      flatShading: false,
    });
    this.body = new Mesh(bodyGeometry, this.bodyMaterial);
    this.body.castShadow = true;
    this.body.receiveShadow = true;
    this.body.scale.set(1, 0.94, 1);
    this.rollingRoot.add(this.body);

    const puffGeometry = new SphereGeometry(0.5, 12, 10);
    const puffMaterial = new MeshStandardMaterial({
      color: "#fbfcff",
      roughness: 0.98,
    });

    const puffOffsets = [
      new Vector3(1.26, 0.82, 1.04),
      new Vector3(-1.42, 0.56, 1.2),
      new Vector3(1.18, 0.48, -1.08),
      new Vector3(-0.96, 1.04, -0.98),
      new Vector3(0.12, 1.28, 0.08),
      new Vector3(-0.22, -0.12, 1.58),
      new Vector3(0.96, -0.22, 1.22),
    ];

    puffOffsets.forEach((offset, index) => {
      const puff = new Mesh(puffGeometry, puffMaterial);
      puff.position.copy(offset);
      const scale = index < 5 ? 1 : 0.72;
      puff.scale.setScalar(scale);
      puff.castShadow = true;
      this.fluff.push(puff);
      this.rollingRoot.add(puff);
    });

    const facePatch = new Mesh(
      new SphereGeometry(0.92, 18, 16),
      new MeshStandardMaterial({
        color: "#f9fbff",
        roughness: 0.96,
      }),
    );
    facePatch.scale.set(1.08, 0.92, 0.42);
    facePatch.position.set(0, 0.24, 1.78);
    this.faceAnchor.add(facePatch);

    const eyeGeometry = new SphereGeometry(0.24, 16, 14);
    const eyeMaterial = new MeshStandardMaterial({
      color: "#151b26",
      roughness: 0.1,
      metalness: 0,
    });
    const leftEye = new Mesh(eyeGeometry, eyeMaterial);
    const rightEye = new Mesh(eyeGeometry, eyeMaterial);
    leftEye.scale.set(0.82, 1.28, 0.72);
    rightEye.scale.set(0.82, 1.28, 0.72);
    leftEye.position.set(-0.52, 0.3, 1.98);
    rightEye.position.set(0.52, 0.3, 1.98);
    this.eyeMeshes.push(leftEye, rightEye);
    this.faceAnchor.add(leftEye, rightEye);

    const cheekGeometry = new SphereGeometry(0.13, 10, 8);
    const cheekMaterial = new MeshStandardMaterial({
      color: "#e6d8d7",
      roughness: 1,
      transparent: true,
      opacity: 0.46,
    });
    const leftCheek = new Mesh(cheekGeometry, cheekMaterial);
    const rightCheek = new Mesh(cheekGeometry, cheekMaterial);
    leftCheek.scale.set(1.8, 1, 0.6);
    rightCheek.scale.set(1.8, 1, 0.6);
    leftCheek.position.set(-0.86, -0.02, 1.9);
    rightCheek.position.set(0.86, -0.02, 1.9);
    this.cheekMeshes.push(leftCheek, rightCheek);
    this.faceAnchor.add(leftCheek, rightCheek);

    const tuftGeometry = new IcosahedronGeometry(0.34, 2);
    const tuftMaterial = new MeshStandardMaterial({
      color: "#ffffff",
      roughness: 0.98,
    });
    const tuftOffsets = [
      new Vector3(-0.72, 1.74, 0.1),
      new Vector3(0.0, 1.9, -0.18),
      new Vector3(0.76, 1.62, 0.18),
      new Vector3(0.34, 1.5, -0.78),
    ];

    tuftOffsets.forEach((offset, index) => {
      const tuft = new Mesh(tuftGeometry, tuftMaterial);
      tuft.position.copy(offset);
      tuft.scale.set(
        1 + index * 0.04,
        0.88 + index * 0.06,
        1 + (index % 2) * 0.08,
      );
      tuft.castShadow = true;
      this.topTufts.push(tuft);
      this.rollingRoot.add(tuft);
    });

    const legGeometry = new SphereGeometry(0.34, 12, 10);
    const legMaterial = new MeshStandardMaterial({
      color: "#f7fbff",
      roughness: 0.98,
    });
    const legOffsets = [
      new Vector3(-0.72, -1.88, 0.64),
      new Vector3(0.72, -1.88, 0.64),
    ];

    legOffsets.forEach((offset, index) => {
      const leg = new Mesh(legGeometry, legMaterial);
      leg.position.copy(offset);
      leg.scale.set(1.08, 1.28, 1.02);
      leg.castShadow = true;
      leg.receiveShadow = true;
      this.legs.push(leg);
      this.legRoot.add(leg);
    });

    this.rollingRoot.add(this.faceAnchor);
    this.group.position.y = this.radius;
  }

  update(player: PlayerState, dt: number) {
    this.group.position.copy(player.position);

    const planarVelocity = this.localVelocity.set(player.velocity.x, 0, player.velocity.z);
    const planarSpeed = planarVelocity.length();
    const bobStrength = player.swimming ? 1.35 : player.grounded ? 1 : 0.35;
    this.bob += dt * MathUtils.clamp(planarSpeed * 0.09, 0.3, 3);
    this.group.position.y += Math.sin(this.bob * 2.7) * 0.06 * bobStrength;
    this.rollBlend = MathUtils.damp(this.rollBlend, player.rolling ? 1 : 0, 9, dt);
    this.stepCycle += dt * MathUtils.clamp(planarSpeed * 0.42, 0, 9);

    const desiredHeading = player.heading;
    this.locomotionRoot.rotation.y = MathUtils.lerp(
      this.locomotionRoot.rotation.y,
      desiredHeading,
      1 - Math.exp(-dt * 9),
    );

    const squashStretch = player.swimming
      ? 1 + Math.sin(this.bob * 2.2) * 0.04
      : player.grounded
      ? 1 - Math.min(0.12, planarSpeed * 0.0022)
      : 1 + MathUtils.clamp(player.velocity.y * 0.012, -0.08, 0.16);
    this.locomotionRoot.scale.set(
      MathUtils.lerp(this.locomotionRoot.scale.x, 1.02 - (squashStretch - 1) * 0.4, 1 - Math.exp(-dt * 8)),
      MathUtils.lerp(this.locomotionRoot.scale.y, squashStretch, 1 - Math.exp(-dt * 8)),
      MathUtils.lerp(this.locomotionRoot.scale.z, 1.02 - (squashStretch - 1) * 0.4, 1 - Math.exp(-dt * 8)),
    );

    if (player.rolling && planarSpeed > 0.001) {
      this.localVelocity
        .set(player.velocity.x, 0, player.velocity.z)
        .applyAxisAngle(this.upAxis, -this.locomotionRoot.rotation.y);

      this.rollAxis.set(this.localVelocity.z, 0, -this.localVelocity.x).normalize();
      const rollAngle = (planarSpeed * dt) / this.radius;
      this.rollQuat.setFromAxisAngle(this.rollAxis, rollAngle);
      this.rollingRoot.quaternion.premultiply(this.rollQuat);
    } else {
      this.rollingRoot.quaternion.slerp(this.identityQuat, 1 - Math.exp(-dt * 10));
    }

    this.locomotionRoot.rotation.z = MathUtils.lerp(
      this.locomotionRoot.rotation.z,
      -MathUtils.clamp(player.velocity.x * 0.015, -0.2, 0.2),
      1 - Math.exp(-dt * 4.5),
    );
    this.locomotionRoot.rotation.x = MathUtils.lerp(
      this.locomotionRoot.rotation.x,
      MathUtils.clamp(planarSpeed * 0.012, -0.12, 0.18) + (player.grounded ? 0 : MathUtils.clamp(player.velocity.y * -0.01, -0.2, 0.2)),
      1 - Math.exp(-dt * 4.5),
    );

    this.faceAnchor.position.y = 0.04 + Math.sin(this.bob * 2.1) * 0.028;
    this.rollingRoot.position.y = MathUtils.lerp(0.18, 0, this.rollBlend);
    this.legRoot.position.y = MathUtils.lerp(0, 0.42, this.rollBlend);
    this.legRoot.scale.setScalar(1 - this.rollBlend * 0.82);

    this.fluff.forEach((puff, index) => {
      const baseScale = index < 5 ? 1 : 0.72;
      puff.scale.setScalar(baseScale + Math.sin(this.bob * 2 + index * 0.7) * 0.035);
    });

    this.topTufts.forEach((tuft, index) => {
      tuft.rotation.x = Math.sin(this.bob * 1.6 + index) * 0.08;
      tuft.rotation.z = Math.cos(this.bob * 1.35 + index * 0.7) * 0.08;
    });

    const snowTint = player.swimming ? "#e4f1f7" : player.grounded ? "#f4f8fb" : "#eef5ff";
    this.bodyMaterial.color.set(snowTint);

    this.legs.forEach((leg, index) => {
      const phase = this.stepCycle * (player.rolling ? 0.4 : 1.9) + (index === 0 ? 0 : Math.PI);
      const stepLift = Math.max(0, Math.sin(phase)) * 0.22 * (1 - this.rollBlend);
      const stepSwing = Math.sin(phase) * 0.18 * (1 - this.rollBlend);
      const baseY = -1.88;
      const baseZ = 0.64;
      leg.position.y = baseY + stepLift;
      leg.position.z = baseZ + stepSwing;
      leg.rotation.x = stepSwing * 1.25;
      leg.visible = this.rollBlend < 0.98 && !player.swimming;
    });
  }
}
