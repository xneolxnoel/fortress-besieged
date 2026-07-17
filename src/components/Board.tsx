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

  // Clear any preview when the turn or interactivity changes (no stale ghost on the next move).
  useEffect(() => {
    setHover(null)
    setAwaitConfirm(false)
  }, [mover, interactive])

  // Static layers — memoized so pointer-move (which only changes the ghost) stays cheap.
  const cells = useMemo(() => renderCells(), [])
  const placedWalls = useMemo(
    () => renderWalls(state.walls.horizontal, state.walls.vertical),
    [state.walls.horizontal, state.walls.vertical],
  )

  /** Convert a pointer event to viewBox coordinates, or null if unavailable. */
  function pointFromEvent(e: ReactPointerEvent | ReactMouseEvent): DOMPoint | null {
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
    if (e.pointerType === 'touch') return // touch has no hover; taps are handled in onPointerDown
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
  function onPointerDown(e: ReactPointerEvent) {
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
        onMove({ type: 'wall', player: mover, x: hover.x, y: hover.y, orientation: hover.orientation })
      }
      setHover(null)
      setAwaitConfirm(false)
    } else {
      setHover(next)
      setAwaitConfirm(true)
    }
  }

  function onClick(e: ReactMouseEvent) {
    if (pointerTypeRef.current === 'touch') return // touch placement handled in onPointerDown
    if (!interactive || wallsLeft <= 0) return
    const h = pointerToWall(e)
    if (h && isWallLegal(state, h.x, h.y, h.orientation)) {
      onMove({ type: 'wall', player: mover, x: h.x, y: h.y, orientation: h.orientation })
    }
  }

  const hoverLegal =
    hover !== null && interactive && wallsLeft > 0 && isWallLegal(state, hover.x, hover.y, hover.orientation)

  return (
    <div className="board-wrap">
      <svg
        ref={svgRef}
        viewBox="-0.5 -0.5 10 10"
        className="board"
        shapeRendering="geometricPrecision"
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerLeave={() => {
          setHover(null)
          setAwaitConfirm(false)
        }}
        onClick={onClick}
      >
        {/* Goal-edge bands in the margin: top = White's goal, bottom = Black's goal */}
        <rect x={0} y={-0.5} width={9} height={0.42} className="edge-goal-white" />
        <rect x={0} y={9.08} width={9} height={0.42} className="edge-goal-black" />

        {/* Groove background + tiled cells (dark gaps between tiles = the grooves) */}
        <rect x={0} y={0} width={9} height={9} className="board-groove" rx={0.25} />
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
          <circle
            key={`d${c.x},${c.y}`}
            cx={c.x + 0.5}
            cy={8.5 - c.y}
            r={0.16}
            className="move-dot"
            onClick={(e) => {
              e.stopPropagation()
              onMove({ type: 'pawn', player: mover, to: c })
            }}
          >
            <title>{moveToNotation({ type: 'pawn', player: mover, to: c })}</title>
          </circle>
        ))}
      </svg>

      <div className="path-readout">
        <PathInfo state={state} />
      </div>
      {awaitConfirm && (
        <div className="touch-hint">Tap the same spot to place · tap elsewhere to move</div>
      )}
    </div>
  )
}

function renderCells(): ReactNode[] {
  const out: ReactNode[] = []
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 9; x++) {
      const cls = y === 0 ? 'tile tile-home-white' : y === 8 ? 'tile tile-home-black' : 'tile'
      out.push(
        <rect
          key={`c${x},${y}`}
          x={x + G}
          y={8 - y + G}
          width={1 - 2 * G}
          height={1 - 2 * G}
          rx={0.06}
          className={cls}
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
      if (on) out.push(<rect key={`hw${x},${y}`} x={x} y={8 - y - T / 2} width={2} height={T} className="wall" />)
    }),
  )
  vert.forEach((row, x) =>
    row.forEach((on, y) => {
      if (on) out.push(<rect key={`vw${x},${y}`} x={x + 1 - T / 2} y={7 - y} width={T} height={2} className="wall" />)
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
    return <rect x={anchor.x} y={8 - anchor.y - T / 2} width={2} height={T} fill={fill} opacity={0.65} />
  }
  return <rect x={anchor.x + 1 - T / 2} y={7 - anchor.y} width={T} height={2} fill={fill} opacity={0.65} />
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
      {active && <circle cx={cx} cy={cy} r={0.4} className="pawn-active" />}
      <path
        d={PAWN_PATH}
        transform={`translate(${cx} ${cy}) scale(0.95)`}
        className={`pawn pawn-${player}`}
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
