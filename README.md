# Mossu

Mossu is a cozy third-person exploration game prototype built with TypeScript, Vite, and Three.js. Its current visual target is a painterly creature-habitat route with readable clearings, crisp tree silhouettes, soft far-range atmosphere, anime-like color separation, and light character outlines.

The current playable slice follows Mossu from Burrow Hollow through meadows, rivers, foothills, alpine shelves, and ridge paths toward Moss Crown Shrine. The game is exploration-first: the main verbs are moving, rolling, floating, swimming, discovering landmarks, gathering small forageables, opening the map, and checking the inventory/profile.

Progress saves locally in normal play. The pause menu includes a fresh-start reset for quickly returning Mossu and the saved guide state to the Burrow Hollow baseline during iteration.

## Controls

- `W/A/S/D`: camera-relative movement
- `Space`: jump / float / swim stroke
- `Q`: dedicated Breeze Float / underwater dive
- `Shift`: roll
- `E`: interact / recruit / catalog nearby things
- `Tab`: inventory / profile
- `M`: map
- `Esc`: pause

Arrow keys currently remain as optional movement fallback.

## Docs

- [Docs Index](docs/README.md): where to start and which docs own which decisions.
- [Game Memory](docs/GAME_MEMORY.md): durable creative and product direction.
- [Technical Overview](docs/TECHNICAL_OVERVIEW.md): architecture, systems, and implementation contracts.
- [Redesign Roadmap](docs/REDESIGN_ROADMAP.md): phased plan for the full redesign.
- [Systems Audit](docs/SYSTEMS_AUDIT.md): current-state audit for terrain, rivers, inventory, grass, herd AI, and performance.
- [Playtest Checklist](docs/PLAYTEST_CHECKLIST.md): repeatable verification checklist.
- [Known Issues](docs/KNOWN_ISSUES.md): active caveats and watchlist items.
- [Asset Parking](docs/ASSET_PARKING.md): preserved inactive systems and assets.

`progress.md` is the long chronological implementation log. The docs above are the cleaner working source of truth.

## Development

```bash
npm install
npm run dev
npm run build
```

Use `npm run qa` before treating a code pass as complete.

For **run commands, `?perfDebug=1`, `?modelViewer`, WebGPU, and `quality=low`**, see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).
