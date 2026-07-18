// SVG board renderer + interaction.
//
// Screen mapping (viewBox -0.5..9.5 on both axes, y grows downward):
//   - Cell (x, y) -> tile rect inset inside [x, x+1] x [8 - y, 9 - y]. Row 0 sits at the
//     bottom (white's start), row 8 at the top (black's start). White races up to the top edge.
//   - Pawn center: (x + 0.5, 8.5 - y).
//   - Wall anchor (wx, wy): intersection point at (wx + 1, 8 - wy).
//       Horizontal wall: rect (wx, 8 - wy - T/2) size 2 x T.
//       Vertical wall:   rect (wx + 1 - T/2, 7 - wy) size T x 2.
//
// Wall orientation is chosen automatically from the cursor: offset left/right of an
// intersection -> horizontal; offset above/below -> vertical. No manual toggle.

import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import {
  isWallLegal,
  moveToNotation,
  pawnDestinations,
  playerDistance,
  type Cell,
  type GameState,
  type Move,
  type Orientation,
  type Player,
} from '../engine'

const G = 0.045 // tile inset -> visible dark groove between cells
const T = 0.16 // wall thickness

// A pawn silhouette (small head + narrow neck + flared base), in local coords centred near the
// origin with the head pointing up. The head is deliberately much narrower than the base so the
// shape reads as a pawn, not a disc. Scaled and translated onto each cell.
const PAWN_PATH =
  'M 0,-0.345 C 0.06,-0.345 0.105,-0.30 0.105,-0.235 C 0.105,-0.18 0.075,-0.15 0.045,-0.135 ' +
  'C 0.05,-0.10 0.115,-0.06 0.115,-0.03 C 0.11,0.0 0.085,0.025 0.085,0.105 ' +
  'C 0.085,0.155 0.135,0.185 0.17,0.205 L 0.23,0.205 C 0.27,0.205 0.29,0.23 0.29,0.26 ' +
  'L 0.29,0.28 C 0.29,0.30 0.27,0.315 0.245,0.315 L -0.245,0.315 C -0.27,0.315 -0.29,0.30 -0.29,0.28 ' +
  'L -0.29,0.26 C -0.29,0.23 -0.27,0.205 -0.23,0.205 L -0.17,0.205 C -0.135,0.185 -0.085,0.155 -0.085,0.105 ' +
  'C -0.085,0.025 -0.11,0.0 -0.115,-0.03 C -0.115,-0.06 -0.05,-0.10 -0.045,-0.135 ' +
  'C -0.075,-0.15 -0.105,-0.18 -0.105,-0.235 C -0.105,-0.30 -0.06,-0.345 0,-0.345 Z'

interface BoardProps {
  state: GameState
  interactive: boolean
  onMove: (move: Move) => void
}

interface Hover {
  x: number
  y: number
  orientation: Orientation
}

interface Anchor {
  x: number
  y: number
}

export function Board({ state, interactive, onMove }: BoardProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<Hover | null>(null)
  const pointerTypeRef = useRef<PointerEvent['pointerType']>('mouse')
  const [awaitConfirm, setAwaitConfirm] = useState(false)

  const mover: Player = state.turn
  const showDots = interactive && state.status === 'playing'
  const dests: Cell[] = useMemo(
    () => (showDots ? pawnDestinations(state, mover) : []),
    [showDots, state, mover],
  )
  const wallsLeft = state.wallsLeft[mover]
  const lastMove = state.history.length ? state.history[state.history.length - 1] : null

  // Clear the preview only when the board becomes non-interactive (game over, AI thinking).
  // Clearing after a human move happens synchronously in handleMove, so a fresh preview made
  // right after the AI responds can never be wiped by a late-flushed effect.
  useEffect(() => {
    if (!interactive) {
      setHover(null)
      setAwaitConfirm(false)
    }
  }, [interactive])

  /** The human made a move: drop any wall preview, then forward it. */
  function handleMove(move: Move) {
    setHover(null)
    setAwaitConfirm(false)
    onMove(move)
  }

  // Static layers — memoized so pointer-move (which only changes the ghost) stays cheap.
  const cells = useMemo(() => renderCells(), [])
  const placedWalls = useMemo(
    () => renderWalls(state.walls.horizontal, state.walls.vertical),
    [state.walls.horizontal, state.walls.vertical],
  )

  /** Convert a pointer event to viewBox coordinates, or null if unavailable. */
  function pointFromEvent(e: ReactPointerEvent | ReactMouseEvent | PointerEvent): DOMPoint | null {
    const svg = svgRef.current
    const ctm = svg?.getScreenCTM()
    if (!svg || !ctm) return null
    return new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
  }

  /** Nearest wall anchor + auto orientation for a viewBox point. */
  function anchorFromPoint(p: DOMPoint): Hover {
    const ix = Math.max(1, Math.min(8, Math.round(p.x)))
    const iy = Math.max(1, Math.min(8, Math.round(p.y)))
    const orientation: Orientation = Math.abs(p.x - ix) >= Math.abs(p.y - iy) ? 'H' : 'V'
    return { x: ix - 1, y: 8 - iy, orientation }
  }

  /** Convert a pointer position to the nearest wall anchor + auto orientation. */
  function pointerToWall(e: ReactPointerEvent | ReactMouseEvent): Hover | null {
    const p = pointFromEvent(e)
    return p ? anchorFromPoint(p) : null
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (e.pointerType === 'touch') return // touch has no hover; taps are handled natively (handlePointerDown)
    if (!interactive || wallsLeft <= 0) {
      setHover(null)
      return
    }
    const p = pointFromEvent(e)
    if (!p) return
    // Hide the wall ghost while the cursor is over a legal-move dot (the dot enlarges via :hover).
    // Done geometrically so it can never get stuck (pointerleave on dots is unreliable).
    const overDot = dests.some((c) => Math.hypot(p.x - (c.x + 0.5), p.y - (8.5 - c.y)) < 0.2)
    if (overDot) {
      setHover(null)
      return
    }
    const next = anchorFromPoint(p)
    setHover((prev) =>
      prev && prev.x === next.x && prev.y === next.y && prev.orientation === next.orientation
        ? prev
        : next,
    )
  }

  // Touch uses a two-tap flow: the first tap previews the wall (ghost), the second tap on the
  // same intersection places it. Mouse/pen keep the hover-then-click behaviour.
  // Attached as a NATIVE listener (effect below): React's delegated synthetic events were
  // observed to occasionally drop a pointerdown dispatched right after an off-thread (worker)
  // commit — i.e. exactly when the human taps after the AI moves. A native listener on the svg
  // always fires; the ref indirection keeps the closure fresh.
  function handlePointerDown(e: PointerEvent) {
    pointerTypeRef.current = e.pointerType
    if (e.pointerType !== 'touch' || !interactive || wallsLeft <= 0) return
    const p = pointFromEvent(e)
    if (!p) return
    const overDot = dests.some((c) => Math.hypot(p.x - (c.x + 0.5), p.y - (8.5 - c.y)) < 0.2)
    if (overDot) {
      setHover(null)
      setAwaitConfirm(false)
      return // tapping a dot moves the pawn; the dot's own handler does that
    }
    const next = anchorFromPoint(p)
    // Second tap on the same intersection confirms, using the already-previewed orientation.
    if (hover && hover.x === next.x && hover.y === next.y) {
      if (isWallLegal(state, hover.x, hover.y, hover.orientation)) {
        handleMove({ type: 'wall', player: mover, x: hover.x, y: hover.y, orientation: hover.orientation })
      }
      setHover(null)
      setAwaitConfirm(false)
    } else {
      setHover(next)
      setAwaitConfirm(true)
    }
  }

  const pointerDownRef = useRef(handlePointerDown)
  pointerDownRef.current = handlePointerDown
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const listener = (e: PointerEvent) => pointerDownRef.current(e)
    svg.addEventListener('pointerdown', listener)
    return () => svg.removeEventListener('pointerdown', listener)
  }, [])

  function onClick(e: ReactMouseEvent) {
    if (pointerTypeRef.current === 'touch') return // touch placement handled natively (handlePointerDown)
    if (!interactive || wallsLeft <= 0) return
    const h = pointerToWall(e)
    if (h && isWallLegal(state, h.x, h.y, h.orientation)) {
      handleMove({ type: 'wall', player: mover, x: h.x, y: h.y, orientation: h.orientation })
    }
  }

  const hoverLegal =
    hover !== null && interactive && wallsLeft > 0 && isWallLegal(state, hover.x, hover.y, hover.orientation)

  // Touch confirm-bar actions (shown after the first tap previews a wall).
  function flipGhostOrientation() {
    setHover((h) => (h ? { ...h, orientation: h.orientation === 'H' ? 'V' : 'H' } : h))
  }
  function confirmGhostWall() {
    if (hover && wallsLeft > 0 && isWallLegal(state, hover.x, hover.y, hover.orientation)) {
      handleMove({ type: 'wall', player: mover, x: hover.x, y: hover.y, orientation: hover.orientation })
    }
    setHover(null)
    setAwaitConfirm(false)
  }
  function cancelGhostWall() {
    setHover(null)
    setAwaitConfirm(false)
  }

  return (
    <div className="board-wrap">
      <svg
        ref={svgRef}
        viewBox="-0.5 -0.5 10 10"
        className="board"
        shapeRendering="geometricPrecision"
        onPointerMove={onPointerMove}
        onPointerLeave={(e) => {
          // Don't clear a touch preview: touch has no hover to "leave", and a stray mouse
          // pointerleave (e.g. a parked cursor when the confirm bar shifts the layout) must
          // not wipe a preview the user is about to confirm.
          if (e.pointerType === 'touch' || awaitConfirm) return
          setHover(null)
          setAwaitConfirm(false)
        }}
        onClick={onClick}
      >
        {/* Fake-3D paint kit: light comes from the top-left, so gradients run light → dark
            toward the bottom-right and pieces cast soft shadows down-right. */}
        <defs>
          <linearGradient id="frameGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#5a4327" />
            <stop offset="1" stopColor="#2f2314" />
          </linearGradient>
          <linearGradient id="grooveGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#43331f" />
            <stop offset="1" stopColor="#2b2013" />
          </linearGradient>
          <linearGradient id="tileGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f4e9cf" />
            <stop offset="1" stopColor="#d8c6a2" />
          </linearGradient>
          <linearGradient id="tileGradHomeW" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fdf8e8" />
            <stop offset="1" stopColor="#eadcbe" />
          </linearGradient>
          <linearGradient id="tileGradHomeB" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#c9bd9c" />
            <stop offset="1" stopColor="#a3977a" />
          </linearGradient>
          <linearGradient id="wallGradH" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#dc5a44" />
            <stop offset="1" stopColor="#96291b" />
          </linearGradient>
          <linearGradient id="wallGradV" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#dc5a44" />
            <stop offset="1" stopColor="#96291b" />
          </linearGradient>
          <radialGradient id="pawnGradW" cx="0.35" cy="0.3" r="0.9">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#cfc8b8" />
          </radialGradient>
          <radialGradient id="pawnGradB" cx="0.35" cy="0.3" r="0.9">
            <stop offset="0" stopColor="#5b606c" />
            <stop offset="1" stopColor="#14161b" />
          </radialGradient>
          <linearGradient id="edgeGradW" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fbf8f2" />
            <stop offset="1" stopColor="#d6cfc0" />
          </linearGradient>
          <linearGradient id="edgeGradB" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3b3f48" />
            <stop offset="1" stopColor="#17191e" />
          </linearGradient>
          <filter id="wallShadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="0.05" stdDeviation="0.045" floodColor="#000000" floodOpacity="0.45" />
          </filter>
        </defs>

        {/* Wooden frame around the whole board (fills the margin the viewBox adds) */}
        <rect x={-0.5} y={-0.5} width={10} height={10} rx={0.3} fill="url(#frameGrad)" />

        {/* Goal-edge bands in the margin: top = White's goal, bottom = Black's goal */}
        <rect x={0} y={-0.5} width={9} height={0.42} fill="url(#edgeGradW)" />
        <rect x={0} y={9.08} width={9} height={0.42} fill="url(#edgeGradB)" />

        {/* Groove background + tiled cells (dark gaps between tiles = the grooves) */}
        <rect x={0} y={0} width={9} height={9} fill="url(#grooveGrad)" rx={0.25} />
        {cells}

        {placedWalls}

        {lastMove && <LastMoveMarker move={lastMove} />}

        {hover && (
          <GhostWall
            anchor={{ x: hover.x, y: hover.y }}
            orientation={hover.orientation}
            legal={!!hoverLegal}
            affordable={wallsLeft > 0}
          />
        )}

        <Pawn player="white" pos={state.positions.white} active={mover === 'white' && showDots} />
        <Pawn player="black" pos={state.positions.black} active={mover === 'black' && showDots} />

        {/* Legal pawn-move dots (on top); stopPropagation so they don't also place a wall */}
        {dests.map((c) => (
          <g key={`d${c.x},${c.y}`}>
            {/* Fat invisible tap target (touch only, enabled via CSS) around the visible dot */}
            <circle
              cx={c.x + 0.5}
              cy={8.5 - c.y}
              r={0.4}
              className="dot-hit"
              onClick={(e) => {
                e.stopPropagation()
                handleMove({ type: 'pawn', player: mover, to: c })
              }}
            />
            <circle
              cx={c.x + 0.5}
              cy={8.5 - c.y}
              r={0.16}
              className="move-dot"
              onClick={(e) => {
                e.stopPropagation()
                handleMove({ type: 'pawn', player: mover, to: c })
              }}
            >
              <title>{moveToNotation({ type: 'pawn', player: mover, to: c })}</title>
            </circle>
          </g>
        ))}
      </svg>

      <div className="path-readout">
        <PathInfo state={state} />
      </div>
      {awaitConfirm && hover && (
        <div className="touch-actions">
          <button type="button" onClick={flipGhostOrientation} title="Flip wall orientation">
            ⇄ Flip
          </button>
          <button type="button" className="place" disabled={!hoverLegal} onClick={confirmGhostWall}>
            ✓ Place wall
          </button>
          <button type="button" onClick={cancelGhostWall} title="Cancel">
            ✕
          </button>
        </div>
      )}
    </div>
  )
}

function renderCells(): ReactNode[] {
  const out: ReactNode[] = []
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 9; x++) {
      const fill = y === 0 ? 'url(#tileGradHomeW)' : y === 8 ? 'url(#tileGradHomeB)' : 'url(#tileGrad)'
      out.push(
        <rect
          key={`c${x},${y}`}
          x={x + G}
          y={8 - y + G}
          width={1 - 2 * G}
          height={1 - 2 * G}
          rx={0.06}
          fill={fill}
        />,
      )
    }
  }
  return out
}

function renderWalls(horiz: boolean[][], vert: boolean[][]): ReactNode[] {
  const out: ReactNode[] = []
  horiz.forEach((row, x) =>
    row.forEach((on, y) => {
      if (on)
        out.push(
          <rect
            key={`hw${x},${y}`}
            x={x}
            y={8 - y - T / 2}
            width={2}
            height={T}
            className="wall"
            fill="url(#wallGradH)"
            filter="url(#wallShadow)"
          />,
        )
    }),
  )
  vert.forEach((row, x) =>
    row.forEach((on, y) => {
      if (on)
        out.push(
          <rect
            key={`vw${x},${y}`}
            x={x + 1 - T / 2}
            y={7 - y}
            width={T}
            height={2}
            className="wall"
            fill="url(#wallGradV)"
            filter="url(#wallShadow)"
          />,
        )
    }),
  )
  return out
}

function GhostWall({
  anchor,
  orientation,
  legal,
  affordable,
}: {
  anchor: Anchor
  orientation: Orientation
  legal: boolean
  affordable: boolean
}) {
  const fill = !affordable ? 'var(--ghost-bad)' : legal ? 'var(--ghost-ok)' : 'var(--ghost-bad)'
  if (orientation === 'H') {
    return (
      <rect x={anchor.x} y={8 - anchor.y - T / 2} width={2} height={T} className="ghost-wall" fill={fill} opacity={0.65} />
    )
  }
  return (
    <rect x={anchor.x + 1 - T / 2} y={7 - anchor.y} width={T} height={2} className="ghost-wall" fill={fill} opacity={0.65} />
  )
}

// Highlights the most recent move: an outline on the destination cell (pawn move) or around the
// just-placed wall, so it's easy to see what changed.
function LastMoveMarker({ move }: { move: Move }) {
  const pad = 0.04
  if (move.type === 'pawn') {
    return (
      <rect
        x={move.to.x + 0.06}
        y={8 - move.to.y + 0.06}
        width={0.88}
        height={0.88}
        rx={0.06}
        className="last-cell"
      />
    )
  }
  if (move.orientation === 'H') {
    return (
      <rect
        x={move.x - pad}
        y={8 - move.y - T / 2 - pad}
        width={2 + pad * 2}
        height={T + pad * 2}
        className="last-wall"
      />
    )
  }
  return (
    <rect
      x={move.x + 1 - T / 2 - pad}
      y={7 - move.y - pad}
      width={T + pad * 2}
      height={2 + pad * 2}
      className="last-wall"
    />
  )
}

function Pawn({ player, pos, active }: { player: Player; pos: Cell; active: boolean }) {
  const cx = pos.x + 0.5
  const cy = 8.5 - pos.y
  return (
    <g onClick={(e) => e.stopPropagation()}>
      {/* Soft ground shadow under the piece — sells the raised-pawn look */}
      <ellipse cx={cx} cy={cy + 0.27} rx={0.27} ry={0.09} fill="#000000" opacity={0.3} />
      {active && <circle cx={cx} cy={cy} r={0.4} className="pawn-active" />}
      <path
        d={PAWN_PATH}
        transform={`translate(${cx} ${cy}) scale(0.95)`}
        className="pawn"
        fill={player === 'white' ? 'url(#pawnGradW)' : 'url(#pawnGradB)'}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </g>
  )
}

function PathInfo({ state }: { state: GameState }) {
  const w = playerDistance('white', state.positions.white, state.walls)
  const b = playerDistance('black', state.positions.black, state.walls)
  return (
    <span className="path-info">
      <span className="dot-white" /> White {w} · <span className="dot-black" /> Black {b}{' '}
      <span className="muted">steps to goal</span>
    </span>
  )
}
