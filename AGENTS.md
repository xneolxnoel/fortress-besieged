# Fortress Besieged — project notes

Web app for the 2-player wall-and-race game (hot-seat or vs AI). TypeScript · React 18 · Vite 5 ·
Vitest · SVG board · Web Worker AI. Never use the name "Quoridor" anywhere (code, docs, files).

## Session work (committed as 3e7042d, pushed to main)

1. **Fake-3D board** (`src/components/Board.tsx`, `src/styles.css`): SVG `<defs>` gradients
   (beveled tiles, wood frame/groove, wall + pawn gradients), `feDropShadow` on walls, ground-shadow
   ellipses under pawns. Flat fills were removed from CSS — tiles/walls/pawns use `fill="url(#…)"`
   attributes; keep it that way (CSS class fills would override the attributes).

2. **Difficulty remap** (`src/ai/ai.ts`): keys unchanged (`easy|normal|hard`), behaviors shifted —
   Easy = depth-2 negamax, Normal = old Hard (`searchIterative(state, 8, 2000)`), Hard =
   `searchIterative(state, 10, 4000, 3)`. The old greedy/random Easy was deleted. Tests use explicit
   timeouts (Hard takes ~4s/move); `integration.test.ts` plays full games only at Easy, with a
   bounded legal-move probe for Normal.

3. **Mobile fixes**:
   - Header (`GameScreen.tsx`, `styles.css`): one line always — `nowrap`, buttons `flex:none`, headline
     ellipsizes in `.turn-text`. Previously wrapped and pushed the board down on AI turns.
   - Touch wall placement (`Board.tsx`): first tap previews, then a `.touch-actions` bar
     (Flip / Place wall / ✕) confirms; two-tap confirm also still works. `.dot-hit` invisible r=0.4
     tap targets around move dots on coarse pointers.
   - Touch `pointerdown` is attached as a **native svg listener** via `pointerDownRef`
     (`handlePointerDown`) — React's delegated synthetic events intermittently dropped a tap arriving
     right after a worker (AI) commit. Don't move it back to a React `onPointerDown` prop.
   - `onPointerLeave` ignores leaves while `awaitConfirm` is set — a stray mouse pointerleave (parked
     cursor + layout shift) used to wipe touch previews.

## Verification

- `npm test`, `npm run build` — must stay green.
- Headless UI scripts (need `npm run dev -- --port 5180 --strictPort --host 127.0.0.1` running;
  `--host 127.0.0.1` required because scripts hit 127.0.0.1 and Vite may bind IPv6-only otherwise):
  `scripts/verify-mobile.mjs` (mobile header stability + touch wall bar — expect 6/6 OK),
  `scripts/verify-touch-highlight.mjs`, `scripts/screenshot.mjs`, `scripts/verify-colors.mjs`.
- LAN access for real devices: `npm run dev -- --host`.
