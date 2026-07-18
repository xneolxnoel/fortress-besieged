# Fortress Besieged

A web app for playing **Fortress Besieged** — a 2-player abstract wall-and-race game — hot-seat for
two humans, or human vs. computer with three difficulty levels. 100% client-side: no backend,
deployable as a static site.

## Play

```bash
npm install
npm run dev      # http://localhost:5170
```

Build a static bundle:

```bash
npm run build    # outputs to dist/
npm run preview  # serve the production build locally
```

### Deploy

This is a static site with no backend; `base: './'` is set so the build works at any path.

- **GitHub Pages (automated):** push to `main` — the included workflow
  `.github/workflows/deploy.yml` builds and deploys. In repo Settings → Pages, set Source to "GitHub Actions".
- **Any static host** (Netlify, Vercel, Cloudflare Pages, S3, …): run `npm run build`, then serve the `dist/` folder.

## Modes

| Mode | Description |
| --- | --- |
| **Hot-seat** | Two humans share one device. |
| **vs Computer — Easy** | Negamax, depth 2. A relaxed casual game. |
| **vs Computer — Normal** | Iterative-deepening negamax (depth 5 opening → 6–8 mid-game, ~2000ms per move) with alpha-beta pruning, PV-first + killer-move ordering, late-move reductions, a Zobrist-hashed transposition table, wider root wall vision (R=2), and a threat-aware evaluation (path length, wall count, goal-edge reachability, and a near-goal threat term so it blocks a losing race instead of walking into it). |
| **vs Computer — Hard** | The same engine pushed further: a doubled think budget (~4000ms per move), a deeper iterative-deepening cap (depth 10), and wider root wall vision (R=3), so it searches deeper and spots longer-range wall plays. |

The AI runs in a **Web Worker** so the UI stays responsive while it thinks.

## Architecture

The app is layered so the rules engine and AI are pure, reusable, and fully unit-tested —
independent of React or the DOM.

```
src/
  engine/        Pure rules engine (TypeScript, zero deps)
    types.ts       Board/cell/wall/move types + constants
    board.ts       Wall & edge model, geometric legality (overlap/crossing)
    pathfind.ts    BFS shortest-path + reachability (drives wall legality + AI eval)
    moves.ts       Pawn move generation (jump + diagonal sidestep), wall path-legality
    game.ts        State lifecycle: init / applyMove / win detection / replay
    notation.ts    Algebraic move notation for the move list
  ai/            Bot
    heuristic.ts    Evaluation = (opp path − my path) + wall-count advantage
    search.ts       Negamax + alpha-beta, candidate-wall filtering, move ordering
    ai.ts           Difficulty dispatcher (easy / normal / hard)
    worker.ts       Web Worker entry
  components/    React UI (SVG board, sidebar, start menu, game screen)
  hooks/useGame.ts  State, AI worker glue, undo, localStorage persistence
```

### Key engine guarantees

- **Wall legality** = geometric placement (no overlap, no crossing) **and** a BFS connectivity
  check confirming every player still has a path to their goal edge.
- **Pawn movement** correctly handles straight jumps and diagonal side-steps at blocked/edge cells.
- All state transitions are **immutable**; `applyMove` clones before mutating.

## Testing

```bash
npm test         # unit + integration tests
```

The suite covers the rule edge cases (jump, diagonal sidestep, enclosure rejection, geometry,
win/notation) plus **full-game AI self-play** that proves the engine+bot loop only ever emits legal
moves and always reaches a terminal state.

A headless browser smoke test (`scripts/smoke.mjs`, `scripts/verify-clicks.mjs`) drives the real UI
in Chrome via `puppeteer-core` — handy for catching UI/worker regressions:

```bash
npm run dev   # in one terminal
node scripts/verify-clicks.mjs
```

## Tech

TypeScript · React 18 · Vite 5 · Vitest · SVG board · Web Workers. No runtime backend.
