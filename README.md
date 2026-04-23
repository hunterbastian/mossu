# Mossu

Mossu is a cozy third-person exploration game prototype built with TypeScript, Vite, and Three.js.

The current playable slice follows Mossu from Burrow Hollow through meadows, rivers, foothills, alpine shelves, and ridge paths toward Moss Crown Shrine. The game is exploration-first: the main verbs are moving, rolling, floating, swimming, discovering landmarks, gathering small forageables, opening the map, and checking the inventory/profile.

## Controls

- `W/A/S/D`: camera-relative movement
- `Space`: jump / float / swim stroke
- `Shift`: roll
- `E`: interact / recruit / catalog nearby things
- `Tab`: inventory / profile
- `M`: map
- `Esc`: pause

Arrow keys currently remain as optional movement fallback.

## Docs

- [Game Memory](docs/GAME_MEMORY.md): durable creative and product direction.
- [Technical Overview](docs/TECHNICAL_OVERVIEW.md): architecture, systems, and implementation contracts.
- [Redesign Roadmap](docs/REDESIGN_ROADMAP.md): phased plan for the full redesign.
- [Systems Audit](docs/SYSTEMS_AUDIT.md): current-state audit for terrain, rivers, inventory, grass, herd AI, and performance.
- [Playtest Checklist](docs/PLAYTEST_CHECKLIST.md): repeatable verification checklist.

`progress.md` is the long chronological implementation log. The docs above are the cleaner working source of truth.

## Development

```bash
npm install
npm run dev
npm run build
```

Use `npm run build` before treating a pass as complete.
