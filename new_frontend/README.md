# The Squad — portfolio

## Run it

```bash
npm install
npm run dev            # → http://localhost:3000
```

Production build: `npm run build && npm run preview`.

**Controls:** drag, scroll, or use ←/→ to move between cards. Click the centred card (or its name) to open the dossier. Esc closes it.

## Regenerate the card videos (HyperFrames)

The six looping card videos live in `public/cards/member-N.mp4` and are already rendered.
Re-render them after editing `src/data/team.ts`. This needs Node 22+, FFmpeg, and Chrome or Chromium:

```bash
cd hyperframes/cards
npm run render:all           # all members
node render-all.mjs 2        # only member #3 (0-based index)
npm run dev                  # optional: preview/tweak the composition in HyperFrames Studio
```

`hyperframes/cards/index.html` is one composition (768×1024, 6 s seamless loop). `render-all.mjs` reads each
member's name, role, superpower, and colours from `team.ts` and passes them in with `hyperframes render --variables`.

## Where things live

| File                                                                       | What it does                                                                                                                  |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `src/components/WebGLScene.tsx`                                          | Infinite carousel: drag/wheel/key input, snapping, velocity scale, hover raycast, fold-in intro                               |
| `src/webgl/shaders.ts`                                                   | Card shaders ported from the reference: arc bump, paper wobble, fold, pointer dent, paper normal blend, preview→video reveal |
| `src/webgl/textures.ts`                                                  | Procedural paper normal map + static poster shown until each video loads                                                      |
| `src/components/WorkNames.tsx`                                           | Lowercase title with per-letter spring animation and the zigzag "thunder" bar                                                 |
| `src/components/Preloader.tsx`, `TransitionBlocks.tsx`, `Header.tsx` | Reference preloader line, peach wipe transition, header                                                                       |
| `src/data/team.ts`                                                       | Team content: edit this, then re-render the cards                                                                             |
