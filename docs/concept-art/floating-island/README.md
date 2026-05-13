# Floating Island Concept Art

Reference board for Mossu's whole-island silhouette, sky, ocean-below read, cliffs, waterfalls, and terrain massing.

## References

### `chatgpt-floating-island-mountain-waterfalls.png`

Source: user-provided ChatGPT image export from May 10, 2026. The user also shared this ChatGPT reference link: `https://chatgpt.com/s/m_6a013da0109c8191a6e14f25e15efd7a`.

Use for:

- Strong floating-island read: visible ocean far below, atmospheric air gap, tapered underside, and mist around the lower shell.
- Island silhouette: broad playable upper shelf, asymmetric cliff rim, central mountain spine, and smaller side spires.
- Water hierarchy: one main waterfall path from mountain source to front edge, plus secondary thin perimeter falls.
- Terrain hierarchy: bright meadow shelves in front, darker conifer clusters around mid slopes, rocky alpine peaks above.
- Sky/horizon direction: saturated blue upper sky, warm cream haze near the horizon, and large painterly cloud towers that frame the island.
- Edge detail: vertical cliff faces with warm tan rock, green moss/grass lips, and small hanging vegetation.

Avoid copying literally:

- The image is too high-detail and epic for direct runtime matching; Mossu should stay simpler, cuter, and more readable at gameplay camera distance.
- Do not overfill the playable route with tiny detail that hurts performance or path clarity.
- Do not make the island perfectly symmetrical from the front.
- Do not push the mountain so tall that it hides the route or makes Mossu feel tiny in normal play.
- Do not use the image as a runtime texture unless we explicitly decide to ship bitmap concept art.

Implementation translation:

- Terrain: use authored headlands/coves and a central ridge/source cleft, not a round game-board perimeter.
- Shell: keep the smooth terrain-derived underside, but add irregular cliff lips, warm rock striation, mist, and hanging vegetation around selected edges.
- Water: make the main source-to-front waterfall readable in atlas/profile views, then sprinkle smaller perimeter falls.
- Foliage: cluster pines on shelves and cliff lips; leave open meadow lanes for route readability.
- Atmosphere: pair blue upper sky with cream horizon haze and large slow cloud banks.
