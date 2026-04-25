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
  private callPulse = 0;
  private movePulse = 0;
  private rollPulse = 0;
  private jumpPulse = 0;
  private landPulse = 0;
  private swimPulse = 0;
  private previousPlanarSpeed = 0;
  private previousGrounded = true;
  private previousRolling = false;
  private previousSwimming = false;
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

  triggerKaruCall() {
    this.callPulse = 0.72;
  }

  update(player: PlayerState, dt: number) {
    this.callPulse = Math.max(0, this.callPulse - dt);
    this.movePulse = Math.max(0, this.movePulse - dt);
    this.rollPulse = Math.max(0, this.rollPulse - dt);
    this.jumpPulse = Math.max(0, this.jumpPulse - dt);
    this.landPulse = Math.max(0, this.landPulse - dt);
    this.swimPulse = Math.max(0, this.swimPulse - dt);
    this.group.position.copy(player.position);

    const planarVelocity = this.localVelocity.set(player.velocity.x, 0, player.velocity.z);
    const planarSpeed = planarVelocity.length();
    const startedMoving = player.grounded && !player.swimming && planarSpeed > 2.2 && this.previousPlanarSpeed < 0.55;
    const startedRolling = player.rolling && !this.previousRolling;
    const jumped = !player.grounded && this.previousGrounded && player.velocity.y > 2;
    const landed = player.justLanded || (player.grounded && !this.previousGrounded);
    const enteredWater = player.swimming && !this.previousSwimming;

    if (startedMoving) {
      this.movePulse = 0.18;
    }
    if (startedRolling) {
      this.rollPulse = 0.24;
    }
    if (jumped) {
      this.jumpPulse = 0.22;
    }
    if (landed) {
      this.landPulse = Math.max(this.landPulse, 0.26 + MathUtils.clamp(player.landingImpact * 0.02, 0, 0.08));
    }
    if (enteredWater) {
      this.swimPulse = 0.24;
    }

    const moveT = this.movePulse / 0.18;
    const rollT = this.rollPulse / 0.24;
    const jumpT = this.jumpPulse / 0.22;
    const landT = this.landPulse / 0.34;
    const swimT = this.swimPulse / 0.24;
    const bobStrength = player.swimming ? 1.35 : player.grounded ? 1 : 0.35;
    this.bob += dt * MathUtils.clamp(planarSpeed * 0.09, 0.3, 3);
    this.group.position.y += Math.sin(this.bob * 2.7) * 0.06 * bobStrength + jumpT * 0.12 - landT * 0.16 + swimT * 0.08;
    this.rollBlend = MathUtils.damp(this.rollBlend, player.rolling ? 1 : 0, 9, dt);
    this.stepCycle += dt * MathUtils.clamp(planarSpeed * 0.42, 0, 9);

    const desiredHeading = player.heading;
    this.locomotionRoot.rotation.y = MathUtils.lerp(
      this.locomotionRoot.rotation.y,
      desiredHeading,
      1 - Math.exp(-dt * 9),
    );

    const callT = this.callPulse > 0 ? Math.sin((this.callPulse / 0.72) * Math.PI) : 0;
    const squashStretch = player.swimming
      ? 1 + Math.sin(this.bob * 2.2) * 0.04 - swimT * 0.08
      : player.grounded
      ? 1 - Math.min(0.12, planarSpeed * 0.0022)
      : 1 + MathUtils.clamp(player.velocity.y * 0.012, -0.08, 0.16);
    const responsiveWide = moveT * 0.035 + rollT * 0.08 + landT * 0.15 + swimT * 0.08 - jumpT * 0.045;
    const responsiveTall = jumpT * 0.11 - landT * 0.18 - rollT * 0.07 - swimT * 0.1;
    this.locomotionRoot.scale.set(
      MathUtils.lerp(this.locomotionRoot.scale.x, 1.02 - (squashStretch - 1) * 0.4 + callT * 0.035 + responsiveWide, 1 - Math.exp(-dt * 11)),
      MathUtils.lerp(this.locomotionRoot.scale.y, squashStretch + callT * 0.08 + responsiveTall, 1 - Math.exp(-dt * 11)),
      MathUtils.lerp(this.locomotionRoot.scale.z, 1.02 - (squashStretch - 1) * 0.4 + callT * 0.035 + responsiveWide * 0.72, 1 - Math.exp(-dt * 11)),
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
      -MathUtils.clamp(player.velocity.x * 0.018, -0.24, 0.24) - rollT * 0.06,
      1 - Math.exp(-dt * 7),
    );
    this.locomotionRoot.rotation.x = MathUtils.lerp(
      this.locomotionRoot.rotation.x,
      MathUtils.clamp(planarSpeed * 0.014, -0.12, 0.22) + moveT * 0.04 + rollT * 0.08 + (player.grounded ? -landT * 0.05 : MathUtils.clamp(player.velocity.y * -0.012, -0.22, 0.22)),
      1 - Math.exp(-dt * 7),
    );

    this.faceAnchor.position.y = 0.04 + Math.sin(this.bob * 2.1) * 0.028 + callT * 0.06 + jumpT * 0.04 - landT * 0.05;
    this.faceAnchor.scale.set(1 + callT * 0.035 + landT * 0.04, 1 - callT * 0.05 - landT * 0.08 + jumpT * 0.04, 1 + callT * 0.04);
    this.rollingRoot.position.y = MathUtils.lerp(0.18, 0, this.rollBlend);
    this.legRoot.position.y = MathUtils.lerp(0, 0.42, this.rollBlend);
    this.legRoot.scale.setScalar(1 - this.rollBlend * 0.82);

    this.fluff.forEach((puff, index) => {
      const baseScale = index < 5 ? 1 : 0.72;
      const pulseOffset = moveT * 0.02 + rollT * 0.04 + landT * 0.06 + swimT * 0.035;
      puff.scale.setScalar(baseScale + Math.sin(this.bob * 2 + index * 0.7) * 0.035 + pulseOffset);
    });

    this.topTufts.forEach((tuft, index) => {
      tuft.rotation.x = Math.sin(this.bob * 1.6 + index) * 0.08 - callT * (0.18 + index * 0.025) - jumpT * 0.1 + landT * 0.12;
      tuft.rotation.z = Math.cos(this.bob * 1.35 + index * 0.7) * 0.08 + callT * Math.sin(index * 1.4) * 0.12 + rollT * Math.sin(index * 1.2) * 0.08;
    });

    const snowTint = player.swimming ? "#e4f1f7" : player.grounded ? "#f4f8fb" : "#eef5ff";
    this.bodyMaterial.color.set(snowTint);

    this.eyeMeshes.forEach((eye) => {
      eye.scale.y = 1.28 - landT * 0.36 - rollT * 0.1 + jumpT * 0.08;
      eye.scale.x = 0.82 + landT * 0.08;
    });
    this.cheekMeshes.forEach((cheek) => {
      cheek.scale.x = 1.8 + callT * 0.12 + landT * 0.18 + moveT * 0.06;
      cheek.scale.y = 1 - landT * 0.08;
    });

    this.legs.forEach((leg, index) => {
      const phase = this.stepCycle * (player.rolling ? 0.4 : 1.9) + (index === 0 ? 0 : Math.PI);
      const stepLift = Math.max(0, Math.sin(phase)) * 0.22 * (1 - this.rollBlend);
      const stepSwing = Math.sin(phase) * 0.18 * (1 - this.rollBlend);
      const baseY = -1.88;
      const baseZ = 0.64;
      leg.position.y = baseY + stepLift - landT * 0.1 + moveT * 0.05;
      leg.position.z = baseZ + stepSwing + moveT * 0.08;
      leg.rotation.x = stepSwing * 1.25 + moveT * 0.2;
      leg.visible = this.rollBlend < 0.98 && !player.swimming;
    });

    this.previousPlanarSpeed = planarSpeed;
    this.previousGrounded = player.grounded;
    this.previousRolling = player.rolling;
    this.previousSwimming = player.swimming;
  }
}
