// Move generation: legal pawn destinations and legal wall placements.
// This is the most rule-sensitive file (jump + diagonal sidestep + path legality).

import { canPlaceWallGeometry, cloneWalls, inBounds, isEdgeBlocked, neighbor, setWall } from './board'
import { hasPath, isGoalCell } from './pathfind'
import {
  type Cell,
  type GameState,
  type Move,
  type Orientation,
  type Player,
  type WallMove,
  WALL_FIELDS,
} from './types'

export function opponent(p: Player): Player {
  return p === 'white' ? 'black' : 'white'
}

const DIRS = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
]

function perpendicular(dir: { dx: number; dy: number }): { dx: number; dy: number }[] {
  return dir.dx === 0
    ? [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }]
    : [{ dx: 0, dy: 1 }, { dx: 0, dy: -1 }]
}

/**
 * All legal pawn destinations for `player` this turn, including:
 *   - a normal one-step move,
 *   - a straight jump over an adjacent opponent,
 *   - a diagonal sidestep when the square behind the opponent is blocked / off-board.
 */
export function pawnDestinations(state: GameState, player: Player): Cell[] {
  const me = state.positions[player]
  const opp = state.positions[opponent(player)]
  const walls = state.walls
  const out: Cell[] = []
  const seen = new Set<string>()
  const add = (c: Cell) => {
    const k = `${c.x},${c.y}`
    if (!seen.has(k)) {
      seen.add(k)
      out.push(c)
    }
  }

  for (const dir of DIRS) {
    const nb = neighbor(me, dir.dx, dir.dy)
    if (!inBounds(nb.x, nb.y)) continue
    if (isEdgeBlocked(walls, me.x, me.y, nb.x, nb.y)) continue

    if (nb.x === opp.x && nb.y === opp.y) {
      // Opponent is on the neighbouring square: jump or sidestep.
      const beyond = neighbor(nb, dir.dx, dir.dy)
      if (inBounds(beyond.x, beyond.y) && !isEdgeBlocked(walls, nb.x, nb.y, beyond.x, beyond.y)) {
        add(beyond) // straight jump over the opponent
      } else {
        // Square behind is blocked or off-board: sidestep to a perpendicular side cell.
        for (const p of perpendicular(dir)) {
          const side = neighbor(nb, p.dx, p.dy)
          if (inBounds(side.x, side.y) && !isEdgeBlocked(walls, nb.x, nb.y, side.x, side.y)) {
            add(side)
          }
        }
      }
    } else {
      add(nb) // normal move
    }
  }
  return out
}

/**
 * Full wall legality: geometric placement AND neither player is fully enclosed.
 * This is the hot path for the engine — used on every placement and inside the AI search.
 */
export function isWallLegal(state: GameState, x: number, y: number, o: Orientation): boolean {
  const walls = state.walls
  if (!canPlaceWallGeometry(walls, x, y, o)) return false
  // Tentatively place, then verify both players can still reach their goal edge.
  const probe = cloneWalls(walls)
  setWall(probe, x, y, o)
  return (
    hasPath(state.positions.white, (c) => isGoalCell('white', c), probe) &&
    hasPath(state.positions.black, (c) => isGoalCell('black', c), probe)
  )
}

/** All geometrically + path-legal wall placements (used by the AI move generator). */
export function legalWallPlacements(state: GameState): WallMove[] {
  const out: WallMove[] = []
  const player = state.turn
  if (state.wallsLeft[player] <= 0) return out
  const orientations: Orientation[] = ['H', 'V']
  for (let x = 0; x < WALL_FIELDS; x++) {
    for (let y = 0; y < WALL_FIELDS; y++) {
      for (const o of orientations) {
        if (isWallLegal(state, x, y, o)) {
          out.push({ type: 'wall', player, x, y, orientation: o })
        }
      }
    }
  }
  return out
}

/** All legal moves for the player to move. */
export function legalMoves(state: GameState): Move[] {
  const player = state.turn
  const moves: Move[] = []
  for (const to of pawnDestinations(state, player)) {
    moves.push({ type: 'pawn', player, to })
  }
  if (state.wallsLeft[player] > 0) {
    moves.push(...legalWallPlacements(state))
  }
  return moves
}

/** Helper exported for tests / AI: does the proposed wall enclose anyone? */
export function wouldEnclose(state: GameState, x: number, y: number, o: Orientation): boolean {
  return !isWallLegal(state, x, y, o)
}
