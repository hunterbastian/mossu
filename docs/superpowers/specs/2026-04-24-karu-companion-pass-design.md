# Karu Companion Pass Design

## Goal

Make recruited Karu feel more like companions by adding water-aware follow behavior, simple moods, mood icon UI, and a hold-E recall action while preserving the current render-side Karu system.

## Scope

- Keep tap `E` as normal landmark interaction / Karu recruitment.
- Add held `E` as a recall/regroup signal when Karu are already recruited.
- Add four Karu moods: curious, shy, brave, sleepy.
- Use moods to vary follow distance, water confidence, speed, and animation feel.
- Make shallow water produce splash-hop behavior.
- Make deep water either hold Karu at/near the bank or float-follow only for brave Karu.
- Add small mood icon UI assets and surface the dominant herd mood in the HUD prompt.

## Architecture

The pass stays inside the existing render-side Karu system:

- `src/simulation/input.ts` exposes `interactHeld` and `interactHoldSeconds`.
- `src/render/app/GameApp.ts` treats held `E` as a regroup request and passes it to `WorldRenderer`.
- `src/render/world/WorldRenderer.ts` forwards the regroup request to `updateAmbientBlobs`.
- `src/render/world/ambientBlobs.ts` owns Karu mood, water response, and regroup behavior.
- `src/render/app/HudShell.ts` displays the current Karu mood and icon when Karu are nearby or following.

Karu remain unsaved render actors for now. Persistence can be added later if Karu need quests, inventory entries, or long-term bond state.

## Behavior Details

Moods are deterministic by Karu seed so the same cluster feels stable:

- Curious: medium-close follower, sniffs and bobs more often.
- Shy: follows farther behind, avoids deep water, clusters with herd mates.
- Brave: follows closest, can float behind Mossu in deep water.
- Sleepy: follows farthest, moves slower, settles more often.

Water behavior uses the existing `sampleWaterState()` contract:

- No water: normal boids follow.
- Shallow water below swim threshold: Karu keep following with extra splash-hop lift.
- Deep swimmable water: brave Karu float near the water surface; other moods steer toward the nearest dry edge around their target and wait/regroup there.

Recall behavior:

- Holding `E` for a short threshold emits a regroup request.
- Recruited Karu temporarily tighten follow slots behind Mossu.
- The HUD should teach this as `Hold E: call Karu`.

## Testing

- `npm run build`
- Start game in Chrome with `?cameraDebug=1&perfDebug=1`.
- Recruit Karu near the start meadow.
- Carry them over shallow water, deep water, a bank edge, and an uphill section.
- Verify Karu do not disappear, sink badly, stack on Mossu, or jitter at banks.
