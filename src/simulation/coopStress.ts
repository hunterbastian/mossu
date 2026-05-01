import { MathUtils, Vector3 } from "three";
import type { FrameState, PlayerState } from "./gameState";
import {
  sampleTerrainHeight,
  sampleWaterState,
  worldForageables,
  worldLandmarks,
} from "./world";

const DEFAULT_REMOTE_COUNT = 3;
const MAX_REMOTE_COUNT = 4;
const SHARED_EVENT_INTERVAL_SECONDS = 999;
const RECENT_EVENT_LIMIT = 8;

const REMOTE_MOSSU_PALETTES = [
  { body: "#dff4c7", tuft: "#7fc66b", glow: "#bcefa2", emissive: "#426f48" },
  { body: "#cfeadf", tuft: "#78bed0", glow: "#9edff1", emissive: "#3d6b6d" },
  { body: "#f3dfba", tuft: "#d8a957", glow: "#ffe19c", emissive: "#72582d" },
  { body: "#e2d7f5", tuft: "#a88ae0", glow: "#d9c6ff", emissive: "#56447a" },
] as const;

type CoopStressEventKind = "landmark" | "forageable";

export interface CoopStressEvent {
  kind: CoopStressEventKind;
  id: string;
  title: string;
  actorId: string;
  elapsed: number;
}

export interface CoopRemoteMossuState {
  id: string;
  label: string;
  colors: CoopRemoteMossuPalette;
  player: PlayerState;
  activity: "trail" | "roll" | "hop" | "swim" | "forage" | "landmark";
  eventPulse: number;
}

export interface CoopRemoteMossuPalette {
  body: string;
  tuft: string;
  glow: string;
  emissive: string;
}

export interface CoopStressSnapshot {
  enabled: true;
  remoteCount: number;
  remotePlayers: CoopRemoteMossuState[];
  shared: {
    catalogedLandmarkIds: string[];
    gatheredForageableIds: string[];
    recentEvents: CoopStressEvent[];
  };
}

interface RemoteActorRuntime {
  id: string;
  label: string;
  phase: number;
  orbitRadius: number;
  forward: Vector3;
  side: Vector3;
  nextPosition: Vector3;
  previousPosition: Vector3;
  previousAirborne: boolean;
  eventPulse: number;
  nextSurfaceSampleAt: number;
  sampledTerrainY: number;
  sampledWaterDepth: number;
  sampledWaterSurfaceY: number;
  sampledSwimAllowed: boolean;
  player: PlayerState;
}

function createRemotePlayer(): PlayerState {
  return {
    position: new Vector3(),
    velocity: new Vector3(),
    heading: 0,
    stamina: 100,
    staminaMax: 100,
    staminaVisible: false,
    rolling: false,
    rollingBoostActive: false,
    rollHoldSeconds: 0,
    rollModeReady: false,
    floating: false,
    grounded: true,
    swimming: false,
    waterMode: "onLand",
    waterDepth: 0,
    waterSurfaceY: 0,
    fallingToVoid: false,
    voidFallTime: 0,
    justLanded: false,
    justRespawned: false,
    landingImpact: 0,
  };
}

export function getCoopStressRemoteCount(params: URLSearchParams) {
  if (!params.has("coopStress")) {
    return 0;
  }

  const raw = params.get("coopStress");
  const parsed = raw === null || raw === "" || raw === "true"
    ? DEFAULT_REMOTE_COUNT
    : Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_REMOTE_COUNT;
  }

  return MathUtils.clamp(Math.round(parsed), 1, MAX_REMOTE_COUNT);
}

export class CoopStressSimulator {
  private readonly remotes: RemoteActorRuntime[];
  private readonly sharedLandmarkIds = new Set<string>();
  private readonly sharedForageableIds = new Set<string>();
  private readonly recentEvents: CoopStressEvent[] = [];
  private nextSharedEventAt = 2.2;
  private eventCursor = 0;

  constructor(remoteCount = DEFAULT_REMOTE_COUNT) {
    const count = MathUtils.clamp(Math.round(remoteCount), 1, MAX_REMOTE_COUNT);
    this.remotes = Array.from({ length: count }, (_, index) => ({
      id: `remote-${index + 1}`,
      label: `Mossu ${index + 2}`,
      phase: index * 2.18 + 0.62,
      orbitRadius: 6.8 + index * 3.4,
      forward: new Vector3(),
      side: new Vector3(),
      nextPosition: new Vector3(),
      previousPosition: new Vector3(),
      previousAirborne: false,
      eventPulse: 0,
      nextSurfaceSampleAt: 0,
      sampledTerrainY: 0,
      sampledWaterDepth: 0,
      sampledWaterSurfaceY: 0,
      sampledSwimAllowed: false,
      player: createRemotePlayer(),
    }));
  }

  update(frame: FrameState, elapsed: number, dt: number): CoopStressSnapshot {
    this.remotes.forEach((remote, index) => {
      this.updateRemote(remote, index, frame, elapsed, dt);
    });
    this.applySharedEvents(frame, elapsed);

    return {
      enabled: true,
      remoteCount: this.remotes.length,
      remotePlayers: this.remotes.map((remote) => ({
        id: remote.id,
        label: remote.label,
        colors: REMOTE_MOSSU_PALETTES[(Number(remote.id.replace("remote-", "")) - 1) % REMOTE_MOSSU_PALETTES.length],
        player: remote.player,
        activity: this.getActivity(remote),
        eventPulse: Number(remote.eventPulse.toFixed(3)),
      })),
      shared: {
        catalogedLandmarkIds: [...this.sharedLandmarkIds],
        gatheredForageableIds: [...this.sharedForageableIds],
        recentEvents: [...this.recentEvents],
      },
    };
  }

  private updateRemote(
    remote: RemoteActorRuntime,
    index: number,
    frame: FrameState,
    elapsed: number,
    dt: number,
  ) {
    const player = remote.player;
    const local = frame.player;
    const forward = remote.forward.set(Math.sin(local.heading), 0, Math.cos(local.heading));
    const side = remote.side.set(forward.z, 0, -forward.x);
    const speed = Math.hypot(local.velocity.x, local.velocity.z);
    const angle = elapsed * (0.48 + index * 0.06) + remote.phase;
    const lead = MathUtils.clamp(speed * 0.26, 0, 7.2);
    const trail = Math.sin(elapsed * 0.36 + remote.phase) * 2.4;
    const x =
      local.position.x +
      Math.cos(angle) * remote.orbitRadius +
      side.x * trail +
      forward.x * (lead - index * 1.4);
    const z =
      local.position.z +
      Math.sin(angle) * (remote.orbitRadius * 0.72) +
      side.z * trail +
      forward.z * (lead - index * 1.4);
    if (elapsed >= remote.nextSurfaceSampleAt) {
      const water = sampleWaterState(x, z);
      remote.sampledTerrainY = sampleTerrainHeight(x, z);
      remote.sampledWaterDepth = water?.depth ?? 0;
      remote.sampledWaterSurfaceY = water?.surfaceY ?? 0;
      remote.sampledSwimAllowed = Boolean(water?.swimAllowed);
      remote.nextSurfaceSampleAt = elapsed + 0.18 + index * 0.03;
    }
    const terrainY = remote.sampledTerrainY;
    const swimming = remote.sampledWaterDepth > 1.1 && remote.sampledSwimAllowed;
    const hopPhase = elapsed * (1.15 + index * 0.09) + remote.phase;
    const hopWave = Math.max(0, Math.sin(hopPhase));
    const hopLift = swimming ? Math.sin(elapsed * 2.1 + remote.phase) * 0.18 : hopWave ** 2 * (0.9 + index * 0.12);
    const y = swimming ? remote.sampledWaterSurfaceY + 0.74 + hopLift : terrainY + 2.2 + hopLift;
    const nextPosition = remote.nextPosition.set(x, y, z);

    if (dt > 0) {
      player.velocity.copy(nextPosition).sub(remote.previousPosition).multiplyScalar(1 / dt);
    } else {
      player.velocity.set(0, 0, 0);
    }

    const planarSpeed = Math.hypot(player.velocity.x, player.velocity.z);
    const airborne = !swimming && hopLift > 0.1;
    player.position.copy(nextPosition);
    player.heading = planarSpeed > 0.05 ? Math.atan2(player.velocity.x, player.velocity.z) : player.heading;
    player.stamina = player.staminaMax;
    player.staminaVisible = false;
    player.swimming = swimming;
    player.waterDepth = remote.sampledWaterDepth;
    player.waterSurfaceY = remote.sampledWaterSurfaceY;
    player.waterMode = swimming ? "swimmingSurface" : "onLand";
    player.grounded = !airborne && !swimming;
    player.floating = airborne && hopLift > 0.54 && !swimming;
    player.rolling = player.grounded && planarSpeed > 7 && Math.sin(elapsed * 0.78 + remote.phase) > 0.05;
    player.rollingBoostActive = player.rolling;
    player.rollHoldSeconds = player.rolling ? 0.75 : 0;
    player.rollModeReady = player.rolling;
    player.justLanded = remote.previousAirborne && !airborne && !swimming;
    player.landingImpact = player.justLanded ? MathUtils.clamp(planarSpeed / 18, 0.25, 0.9) : 0;
    player.justRespawned = false;
    player.fallingToVoid = false;
    player.voidFallTime = 0;

    remote.previousPosition.copy(nextPosition);
    remote.previousAirborne = airborne;
    remote.eventPulse = Math.max(0, remote.eventPulse - dt);
  }

  private applySharedEvents(frame: FrameState, elapsed: number) {
    if (elapsed < this.nextSharedEventAt) {
      return;
    }

    this.nextSharedEventAt = elapsed + SHARED_EVENT_INTERVAL_SECONDS;
    const remote = this.remotes[this.eventCursor % this.remotes.length];
    this.eventCursor += 1;
    const forageable = this.findNearbyUngatheredForageable(remote, frame);
    if (forageable) {
      this.sharedForageableIds.add(forageable.id);
      frame.save.gatheredForageableIds.add(forageable.id);
      if (!frame.lastGatheredForageableId) {
        frame.lastGatheredForageableId = forageable.id;
      }
      this.pushEvent({
        kind: "forageable",
        id: forageable.id,
        title: forageable.title,
        actorId: remote.id,
        elapsed,
      });
      remote.eventPulse = 1;
      return;
    }

    const landmark = this.findNearbyUncatalogedLandmark(remote, frame);
    if (!landmark) {
      return;
    }

    this.sharedLandmarkIds.add(landmark.id);
    frame.save.catalogedLandmarkIds.add(landmark.id);
    if (!frame.lastCatalogedLandmarkId) {
      frame.lastCatalogedLandmarkId = landmark.id;
    }
    this.pushEvent({
      kind: "landmark",
      id: landmark.id,
      title: landmark.title,
      actorId: remote.id,
      elapsed,
    });
    remote.eventPulse = 1;
  }

  private findNearbyUngatheredForageable(remote: RemoteActorRuntime, frame: FrameState) {
    return worldForageables.find((forageable) => {
      if (
        frame.save.gatheredForageableIds.has(forageable.id) ||
        this.sharedForageableIds.has(forageable.id)
      ) {
        return false;
      }
      return forageable.position.distanceTo(remote.player.position) <= (forageable.interactionRadius ?? 8) + 18;
    });
  }

  private findNearbyUncatalogedLandmark(remote: RemoteActorRuntime, frame: FrameState) {
    return worldLandmarks.find((landmark) => {
      if (
        frame.save.catalogedLandmarkIds.has(landmark.id) ||
        this.sharedLandmarkIds.has(landmark.id)
      ) {
        return false;
      }
      return landmark.position.distanceTo(remote.player.position) <= (landmark.interactionRadius ?? 16) + 18;
    });
  }

  private pushEvent(event: CoopStressEvent) {
    this.recentEvents.unshift({
      ...event,
      elapsed: Number(event.elapsed.toFixed(2)),
    });
    this.recentEvents.length = Math.min(this.recentEvents.length, RECENT_EVENT_LIMIT);
  }

  private getActivity(remote: RemoteActorRuntime): CoopRemoteMossuState["activity"] {
    if (remote.eventPulse > 0.05) {
      return remote.eventPulse > 0.5 ? "forage" : "landmark";
    }
    if (remote.player.swimming) {
      return "swim";
    }
    if (remote.player.rolling) {
      return "roll";
    }
    if (!remote.player.grounded) {
      return "hop";
    }
    return "trail";
  }
}
