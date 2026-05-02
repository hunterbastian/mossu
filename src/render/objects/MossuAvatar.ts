import {
  BackSide,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  Quaternion,
  Vector3,
} from "three";
import { PlayerState } from "../../simulation/gameState";
import { easeInOutSine, easeOutBack, easeOutCubic, easeOutElastic, pulseCurve } from "../motionCurves";
import { ART_DIRECTION_IDS, OOT_PS2_GRASSLANDS_PALETTE } from "../visualPalette";

function addSoftAnimeOutline(mesh: Mesh, color = "#4f675c", scale = 1.045, opacity = 0.32) {
  const outline = new Mesh(
    mesh.geometry,
    new MeshBasicMaterial({
      color,
      side: BackSide,
      transparent: true,
      opacity,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  outline.name = `${mesh.name || "mossu-part"}-soft-anime-outline`;
  outline.scale.setScalar(scale);
  outline.renderOrder = -1;
  mesh.add(outline);
}

export class MossuAvatar {
  readonly group = new Group();

  private readonly locomotionRoot = new Group();
  private readonly rollingRoot = new Group();
  private readonly legRoot = new Group();
  private readonly faceAnchor = new Group();
  private readonly body: Mesh;
  private readonly fluff: Mesh[] = [];
  private readonly fluffBaseOffsets: Vector3[] = [];
  private readonly fluffVelocities: Vector3[] = [];
  private readonly topTufts: Mesh[] = [];
  private readonly tuftBaseOffsets: Vector3[] = [];
  private readonly tuftVelocities: Vector3[] = [];
  private readonly eyeMeshes: Mesh[] = [];
  private readonly catchlightMeshes: Mesh[] = [];
  private readonly cheekMeshes: Mesh[] = [];
  private readonly legs: Mesh[] = [];
  private readonly bodyMaterial: MeshStandardMaterial;
  private readonly localVelocity = new Vector3();
  private readonly secondaryVelocity = new Vector3();
  private readonly secondaryTarget = new Vector3();
  private readonly secondaryOffset = new Vector3();
  private readonly rollAxis = new Vector3();
  private readonly upAxis = new Vector3(0, 1, 0);
  private readonly rollQuat = new Quaternion();
  private readonly identityQuat = new Quaternion();
  private bob = 0;
  private stepCycle = 0;
  private rollBlend = 0;
  private floatBlend = 0;
  private callPulse = 0;
  private movePulse = 0;
  private rollPulse = 0;
  private floatPulse = 0;
  private floatLandPulse = 0;
  private jumpPulse = 0;
  private landPulse = 0;
  private swimPulse = 0;
  private blinkClock = 1.4;
  private previousPlanarSpeed = 0;
  private previousGrounded = true;
  private previousRolling = false;
  private previousFloating = false;
  private previousSwimming = false;
  private readonly radius = 2.2;

  constructor() {
    const mossuArt = OOT_PS2_GRASSLANDS_PALETTE.mossu;
    const materialArt = OOT_PS2_GRASSLANDS_PALETTE.material;
    this.group.userData.artDirection = ART_DIRECTION_IDS.ootPs2Characters;
    this.group.add(this.locomotionRoot);
    this.locomotionRoot.add(this.rollingRoot);
    this.locomotionRoot.add(this.legRoot);

    const bodyGeometry = new SphereGeometry(this.radius, 28, 20);
    this.bodyMaterial = new MeshStandardMaterial({
      color: mossuArt.body,
      roughness: materialArt.characterBodyRoughness,
      metalness: 0,
      flatShading: false,
    });
    this.body = new Mesh(bodyGeometry, this.bodyMaterial);
    this.body.castShadow = true;
    this.body.receiveShadow = true;
    this.body.scale.set(1.06, 0.9, 1.02);
    addSoftAnimeOutline(this.body, "#5d6e61", 1.038, 0.28);
    this.rollingRoot.add(this.body);

    const puffGeometry = new SphereGeometry(0.52, 16, 12);
    const puffMaterial = new MeshStandardMaterial({
      color: mossuArt.fluff,
      roughness: materialArt.characterSoftRoughness,
      flatShading: false,
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
      addSoftAnimeOutline(puff, "#697767", 1.05, 0.22);
      this.fluff.push(puff);
      this.fluffBaseOffsets.push(offset.clone());
      this.fluffVelocities.push(new Vector3());
      this.rollingRoot.add(puff);
    });

    const facePatch = new Mesh(
      new SphereGeometry(0.92, 18, 12),
      new MeshStandardMaterial({
        color: mossuArt.face,
        roughness: 0.94,
        flatShading: false,
      }),
    );
    facePatch.scale.set(1.16, 0.82, 0.34);
    facePatch.position.set(0, 0.18, 1.82);
    addSoftAnimeOutline(facePatch, "#8b765c", 1.035, 0.2);
    this.faceAnchor.add(facePatch);

    const eyeGeometry = new SphereGeometry(0.31, 16, 12);
    const eyeMaterial = new MeshStandardMaterial({
      color: mossuArt.eye,
      roughness: materialArt.characterEyeRoughness,
      metalness: 0,
      flatShading: false,
    });
    const leftEye = new Mesh(eyeGeometry, eyeMaterial);
    const rightEye = new Mesh(eyeGeometry, eyeMaterial);
    leftEye.scale.set(0.82, 1.34, 0.48);
    rightEye.scale.set(0.82, 1.34, 0.48);
    leftEye.position.set(-0.58, 0.32, 2.04);
    rightEye.position.set(0.58, 0.32, 2.04);
    this.eyeMeshes.push(leftEye, rightEye);
    this.faceAnchor.add(leftEye, rightEye);

    const catchlightGeometry = new SphereGeometry(0.048, 10, 8);
    const catchlightMaterial = new MeshStandardMaterial({
      color: mossuArt.catchlight,
      emissive: mossuArt.catchlightEmissive,
      emissiveIntensity: 0.18,
      roughness: materialArt.characterHighlightRoughness,
      flatShading: false,
    });
    const leftCatchlight = new Mesh(catchlightGeometry, catchlightMaterial);
    const rightCatchlight = new Mesh(catchlightGeometry, catchlightMaterial);
    leftCatchlight.scale.set(0.82, 1.22, 0.42);
    rightCatchlight.scale.set(0.82, 1.22, 0.42);
    leftCatchlight.position.set(-0.65, 0.45, 2.21);
    rightCatchlight.position.set(0.5, 0.45, 2.21);
    this.catchlightMeshes.push(leftCatchlight, rightCatchlight);
    this.faceAnchor.add(leftCatchlight, rightCatchlight);

    const cheekGeometry = new SphereGeometry(0.13, 12, 8);
    const cheekMaterial = new MeshStandardMaterial({
      color: mossuArt.cheek,
      roughness: 1,
      transparent: true,
      opacity: 0.38,
      flatShading: false,
    });
    const leftCheek = new Mesh(cheekGeometry, cheekMaterial);
    const rightCheek = new Mesh(cheekGeometry, cheekMaterial);
    leftCheek.scale.set(1.8, 1, 0.6);
    rightCheek.scale.set(1.8, 1, 0.6);
    leftCheek.position.set(-0.9, -0.04, 1.94);
    rightCheek.position.set(0.9, -0.04, 1.94);
    this.cheekMeshes.push(leftCheek, rightCheek);
    this.faceAnchor.add(leftCheek, rightCheek);

    const tuftGeometry = new SphereGeometry(0.36, 14, 10);
    const tuftMaterial = new MeshStandardMaterial({
      color: mossuArt.tuft,
      roughness: 0.95,
      flatShading: false,
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
      tuft.scale.set(1 + index * 0.04, 0.88 + index * 0.06, 1 + (index % 2) * 0.08);
      tuft.castShadow = true;
      addSoftAnimeOutline(tuft, "#84775d", 1.052, 0.2);
      this.topTufts.push(tuft);
      this.tuftBaseOffsets.push(offset.clone());
      this.tuftVelocities.push(new Vector3());
      this.rollingRoot.add(tuft);
    });

    const legGeometry = new SphereGeometry(0.36, 14, 10);
    const legMaterial = new MeshStandardMaterial({
      color: mossuArt.leg,
      roughness: 0.96,
      flatShading: false,
    });
    const legOffsets = [new Vector3(-0.72, -1.88, 0.64), new Vector3(0.72, -1.88, 0.64)];

    legOffsets.forEach((offset) => {
      const leg = new Mesh(legGeometry, legMaterial);
      leg.position.copy(offset);
      leg.scale.set(1.16, 1.1, 1.02);
      leg.castShadow = true;
      leg.receiveShadow = true;
      addSoftAnimeOutline(leg, "#71644e", 1.045, 0.24);
      this.legs.push(leg);
      this.legRoot.add(leg);
    });

    this.rollingRoot.add(this.faceAnchor);
    this.group.position.y = this.radius;
  }

  triggerKaruCall() {
    this.callPulse = 0.52;
  }

  update(player: PlayerState, dt: number) {
    this.callPulse = Math.max(0, this.callPulse - dt);
    this.movePulse = Math.max(0, this.movePulse - dt);
    this.rollPulse = Math.max(0, this.rollPulse - dt);
    this.floatPulse = Math.max(0, this.floatPulse - dt);
    this.floatLandPulse = Math.max(0, this.floatLandPulse - dt);
    this.jumpPulse = Math.max(0, this.jumpPulse - dt);
    this.landPulse = Math.max(0, this.landPulse - dt);
    this.swimPulse = Math.max(0, this.swimPulse - dt);
    this.group.position.copy(player.position);

    const planarVelocity = this.localVelocity.set(player.velocity.x, 0, player.velocity.z);
    const planarSpeed = planarVelocity.length();
    const floating = player.floating && !player.swimming;
    const startedMoving = player.grounded && !player.swimming && planarSpeed > 2.2 && this.previousPlanarSpeed < 0.55;
    const startedRolling = player.rolling && !this.previousRolling;
    const startedFloating = floating && !this.previousFloating;
    const endedFloating = !floating && this.previousFloating;
    const jumped = !player.grounded && this.previousGrounded && player.velocity.y > 2;
    const landed = player.justLanded || (player.grounded && !this.previousGrounded);
    const enteredWater = player.swimming && !this.previousSwimming;

    if (startedMoving) {
      this.movePulse = 0.18;
    }
    if (startedRolling) {
      this.rollPulse = 0.24;
    }
    if (startedFloating) {
      this.floatPulse = 0.26;
    }
    if (endedFloating && (landed || player.grounded)) {
      this.floatLandPulse = 0.26;
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

    const moveT = pulseCurve(this.movePulse, 0.18, easeOutCubic);
    const rollT = pulseCurve(this.rollPulse, 0.24, easeOutBack);
    const floatStartT = pulseCurve(this.floatPulse, 0.26, easeOutElastic);
    const floatLandT = pulseCurve(this.floatLandPulse, 0.26, easeOutBack);
    const jumpT = pulseCurve(this.jumpPulse, 0.22, easeOutCubic);
    const landT = pulseCurve(this.landPulse, 0.34, easeOutElastic);
    const swimT = pulseCurve(this.swimPulse, 0.24, easeOutCubic);
    this.blinkClock += dt;
    const bobStrength = player.swimming ? 1.35 : floating ? 0.86 : player.grounded ? 1 : 0.35;
    this.bob += dt * MathUtils.clamp(planarSpeed * 0.09, 0.3, 3);
    this.floatBlend = MathUtils.damp(this.floatBlend, floating ? 1 : 0, floating ? 10.5 : 12, dt);
    const floatT = this.floatBlend;
    const breezeHover = floatT * (0.28 + Math.sin(this.bob * 1.35) * 0.08) + floatStartT * 0.1 - floatLandT * 0.08;
    this.group.position.y +=
      Math.sin(this.bob * 2.7) * 0.06 * bobStrength + jumpT * 0.12 - landT * 0.16 + swimT * 0.08 + breezeHover;
    const rollVisualTarget = player.rolling && !floating ? 1 : 0;
    this.rollBlend = MathUtils.damp(this.rollBlend, rollVisualTarget, 9, dt);
    const rollVisualT = easeInOutSine(this.rollBlend);
    this.stepCycle += dt * MathUtils.clamp(planarSpeed * 0.42, 0, 9);

    const desiredHeading = player.heading;
    this.locomotionRoot.rotation.y = MathUtils.lerp(
      this.locomotionRoot.rotation.y,
      desiredHeading,
      1 - Math.exp(-dt * 9),
    );

    const callT = this.callPulse > 0 ? Math.sin((this.callPulse / 0.52) * Math.PI) : 0;
    this.secondaryVelocity
      .set(player.velocity.x, 0, player.velocity.z)
      .applyAxisAngle(this.upAxis, -this.locomotionRoot.rotation.y);
    this.secondaryTarget.set(
      -MathUtils.clamp(this.secondaryVelocity.x * 0.018, -0.18, 0.18) + rollT * 0.04,
      jumpT * 0.1 - landT * 0.16 + callT * 0.06 + swimT * 0.08 + floatT * 0.1 + floatStartT * 0.04,
      -MathUtils.clamp(this.secondaryVelocity.z * 0.018, -0.2, 0.2) - rollT * 0.08 - floatT * 0.1,
    );
    const squashStretch = player.swimming
      ? 1 + Math.sin(this.bob * 2.2) * 0.04 - swimT * 0.08
      : floating
        ? 1.05 + Math.sin(this.bob * 1.45) * 0.025 + floatStartT * 0.08 - floatLandT * 0.12
        : player.grounded
          ? 1 - Math.min(0.12, planarSpeed * 0.0022)
          : 1 + MathUtils.clamp(player.velocity.y * 0.012, -0.08, 0.16);
    const responsiveWide =
      moveT * 0.035 + rollT * 0.08 + landT * 0.15 + swimT * 0.08 - jumpT * 0.045 + floatT * 0.07 + floatLandT * 0.09;
    const responsiveTall =
      jumpT * 0.11 - landT * 0.18 - rollT * 0.07 - swimT * 0.1 + floatT * 0.03 + floatStartT * 0.08 - floatLandT * 0.12;
    this.locomotionRoot.scale.set(
      MathUtils.lerp(
        this.locomotionRoot.scale.x,
        1.02 - (squashStretch - 1) * 0.4 + callT * 0.035 + responsiveWide,
        1 - Math.exp(-dt * 11),
      ),
      MathUtils.lerp(
        this.locomotionRoot.scale.y,
        squashStretch + callT * 0.08 + responsiveTall,
        1 - Math.exp(-dt * 11),
      ),
      MathUtils.lerp(
        this.locomotionRoot.scale.z,
        1.02 - (squashStretch - 1) * 0.4 + callT * 0.035 + responsiveWide * 0.72,
        1 - Math.exp(-dt * 11),
      ),
    );

    if (player.rolling && !floating && planarSpeed > 0.001) {
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
      MathUtils.clamp(planarSpeed * 0.014, -0.12, 0.22) +
        moveT * 0.04 +
        rollT * 0.08 -
        floatT * 0.14 +
        (player.grounded ? -landT * 0.05 : MathUtils.clamp(player.velocity.y * -0.012, -0.22, 0.22)),
      1 - Math.exp(-dt * 7),
    );

    this.faceAnchor.position.y =
      0.04 + Math.sin(this.bob * 2.1) * 0.028 + callT * 0.06 + jumpT * 0.04 - landT * 0.05 + floatT * 0.04;
    this.faceAnchor.scale.set(
      1 + callT * 0.035 + landT * 0.04 + floatT * 0.035,
      1 - callT * 0.05 - landT * 0.08 + jumpT * 0.04 + floatT * 0.025,
      1 + callT * 0.04,
    );
    this.rollingRoot.position.y = MathUtils.lerp(0.18, 0, rollVisualT);
    this.legRoot.position.y = MathUtils.lerp(0, 0.42, rollVisualT);
    this.legRoot.scale.setScalar(1 - rollVisualT * 0.82);

    this.fluff.forEach((puff, index) => {
      const baseScale = index < 5 ? 1 : 0.72;
      const baseOffset = this.fluffBaseOffsets[index];
      const velocity = this.fluffVelocities[index];
      const lagStrength = index < 5 ? 0.86 : 1.18;
      const sideBias = index % 2 === 0 ? 1 : -1;
      this.secondaryOffset.copy(this.secondaryTarget).multiplyScalar(lagStrength);
      const breezeSpread = floatT * (index < 5 ? 1 : 0.72);
      this.secondaryOffset.x += sideBias * (callT * 0.035 + rollT * 0.025 + breezeSpread * 0.14);
      this.secondaryOffset.y +=
        Math.sin(this.bob * 2.1 + index * 0.9) * 0.025 +
        (index === 4 ? jumpT * 0.06 : 0) +
        breezeSpread * 0.16 +
        floatStartT * 0.035 -
        floatLandT * 0.045;
      this.secondaryOffset.z +=
        (index >= 5 ? landT * 0.08 : 0) +
        Math.cos(this.bob * 1.7 + index) * 0.018 * (player.swimming ? 1.8 : 1) -
        breezeSpread * 0.18;
      const targetX = baseOffset.x + this.secondaryOffset.x;
      const targetY = baseOffset.y + this.secondaryOffset.y;
      const targetZ = baseOffset.z + this.secondaryOffset.z;
      velocity.x += (targetX - puff.position.x) * dt * 32;
      velocity.y += (targetY - puff.position.y) * dt * 34;
      velocity.z += (targetZ - puff.position.z) * dt * 32;
      velocity.multiplyScalar(Math.exp(-dt * 13));
      puff.position.x += velocity.x;
      puff.position.y += velocity.y;
      puff.position.z += velocity.z;
      const pulseOffset =
        moveT * 0.02 + rollT * 0.04 + landT * 0.06 + swimT * 0.035 + floatT * 0.035 + floatStartT * 0.035;
      const flutter = Math.sin(this.bob * 2 + index * 0.7) * 0.035 + pulseOffset;
      puff.scale.set(
        baseScale + flutter + Math.abs(this.secondaryOffset.x) * 0.08 + breezeSpread * 0.035,
        baseScale + flutter * 0.62 - landT * 0.035 + jumpT * 0.025 + breezeSpread * 0.05,
        baseScale + flutter + Math.abs(this.secondaryOffset.z) * 0.06 + breezeSpread * 0.025,
      );
    });

    this.topTufts.forEach((tuft, index) => {
      const baseOffset = this.tuftBaseOffsets[index];
      const velocity = this.tuftVelocities[index];
      const sideBias = index % 2 === 0 ? -1 : 1;
      this.secondaryOffset.copy(this.secondaryTarget).multiplyScalar(1.2 + index * 0.08);
      this.secondaryOffset.x += sideBias * (callT * 0.05 + rollT * 0.04 + floatT * (0.12 + index * 0.018));
      this.secondaryOffset.y +=
        jumpT * 0.08 -
        landT * 0.09 +
        Math.sin(this.bob * 1.9 + index) * 0.024 +
        floatT * (0.18 + index * 0.025) +
        floatStartT * 0.05 -
        floatLandT * 0.06;
      this.secondaryOffset.z += -rollT * 0.06 + swimT * 0.045 - floatT * (0.18 + index * 0.035);
      const targetX = baseOffset.x + this.secondaryOffset.x;
      const targetY = baseOffset.y + this.secondaryOffset.y;
      const targetZ = baseOffset.z + this.secondaryOffset.z;
      velocity.x += (targetX - tuft.position.x) * dt * 40;
      velocity.y += (targetY - tuft.position.y) * dt * 42;
      velocity.z += (targetZ - tuft.position.z) * dt * 40;
      velocity.multiplyScalar(Math.exp(-dt * 10));
      tuft.position.x += velocity.x;
      tuft.position.y += velocity.y;
      tuft.position.z += velocity.z;
      tuft.rotation.x =
        Math.sin(this.bob * 1.6 + index) * 0.08 -
        callT * (0.2 + index * 0.03) -
        jumpT * 0.12 +
        landT * 0.15 -
        this.secondaryOffset.z * 0.28 -
        floatT * 0.18;
      tuft.rotation.z =
        Math.cos(this.bob * 1.35 + index * 0.7) * 0.08 +
        callT * Math.sin(index * 1.4) * 0.14 +
        rollT * Math.sin(index * 1.2) * 0.1 +
        this.secondaryOffset.x * 0.36 +
        sideBias * floatT * 0.1;
    });

    const mossuTint = OOT_PS2_GRASSLANDS_PALETTE.mossu.tint;
    const snowTint = player.swimming
      ? mossuTint.swimming
      : floating
        ? mossuTint.floating
        : player.grounded
          ? mossuTint.grounded
          : mossuTint.airborne;
    this.bodyMaterial.color.set(snowTint);

    const blinkCycle = this.blinkClock % 3.7;
    const blinkT = blinkCycle < 0.16 ? Math.sin((blinkCycle / 0.16) * Math.PI) : 0;
    const eyeSquint = Math.max(blinkT, landT * 0.64 + rollT * 0.16 - floatT * 0.08);
    const eyeAlert = jumpT * 0.09 + callT * 0.08 + floatT * 0.12 + floatStartT * 0.06;
    this.eyeMeshes.forEach((eye, index) => {
      eye.scale.y = Math.max(0.16, 1.34 - eyeSquint * 1.05 + eyeAlert);
      eye.scale.x = 0.82 + landT * 0.12 + callT * 0.04;
      eye.position.y = 0.32 + eyeAlert * 0.08 - landT * 0.025;
      eye.rotation.z = (index === 0 ? -1 : 1) * (callT * 0.035 + moveT * 0.018);
    });
    this.catchlightMeshes.forEach((catchlight) => {
      const visibleT = 1 - MathUtils.clamp(eyeSquint * 1.25, 0, 1);
      catchlight.visible = visibleT > 0.08;
      catchlight.scale.set(0.82 * visibleT, 1.22 * visibleT, 0.42);
      catchlight.position.y = 0.48 + eyeAlert * 0.06 - landT * 0.018;
    });
    this.cheekMeshes.forEach((cheek) => {
      cheek.scale.x = 1.8 + callT * 0.12 + landT * 0.18 + moveT * 0.06;
      cheek.scale.y = 1 - landT * 0.08;
    });

    this.legs.forEach((leg, index) => {
      const phase = this.stepCycle * (player.rolling ? 0.4 : 1.9) + (index === 0 ? 0 : Math.PI);
      const legTuck = MathUtils.clamp(Math.max(rollVisualT, floatT * 0.78), 0, 1);
      const stepLift = Math.max(0, Math.sin(phase)) * 0.22 * (1 - legTuck);
      const stepSwing = Math.sin(phase) * 0.18 * (1 - legTuck);
      const baseY = -1.88;
      const baseZ = 0.64;
      leg.position.y = baseY + stepLift - landT * 0.1 + moveT * 0.05 + floatT * 0.68;
      leg.position.z = baseZ + stepSwing + moveT * 0.08 - floatT * 0.28;
      leg.rotation.x = stepSwing * 1.25 + moveT * 0.2 - floatT * 0.9;
      leg.scale.set(1.16 * (1 - floatT * 0.16), 1.1 * (1 - floatT * 0.34), 1.02 * (1 + floatT * 0.08));
      leg.visible = legTuck < 0.98 && !player.swimming;
    });

    this.previousPlanarSpeed = planarSpeed;
    this.previousGrounded = player.grounded;
    this.previousRolling = player.rolling;
    this.previousFloating = floating;
    this.previousSwimming = player.swimming;
  }
}
