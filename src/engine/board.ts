// Wall / edge model. Derives whether movement between two adjacent cells is blocked,
// and validates the geometric legality of a wall placement (bounds, occupancy, overlap, crossing).
//
// Path legality (no player fully enclosed) lives in pathfind.ts + moves.ts; this file is purely
// about wall geometry.

import { WALL_FIELDS, type Cell, type Orientation, type Walls } from './types'

export function createWalls(): Walls {
  const empty = (): boolean[][] =>
    Array.from({ length: WALL_FIELDS }, () => new Array<boolean>(WALL_FIELDS).fill(false))
  return { horizontal: empty(), vertical: empty() }
}

export function cloneWalls(w: Walls): Walls {
  return {
    horizontal: w.horizontal.map((row) => row.slice()),
    vertical: w.vertical.map((row) => row.slice()),
  }
}

/** True if the edge between two orthogonally adjacent cells is blocked by a wall. */
export function isEdgeBlocked(walls: Walls, ax: number, ay: number, bx: number, by: number): boolean {
  if (ax === bx) {
    // vertical neighbour (same column, adjacent rows)
    const g = ay < by ? ay : by // gap row index (0..7)
    const left = ax >= 1 && walls.horizontal[ax - 1][g]
    const right = ax <= WALL_FIELDS - 1 && walls.horizontal[ax][g]
    return left || right
  }
  // ay === by, horizontal neighbour (same row, adjacent columns)
  const g = ax < bx ? ax : bx // gap column index (0..7)
  const below = ay >= 1 && walls.vertical[g][ay - 1]
  const above = ay <= WALL_FIELDS - 1 && walls.vertical[g][ay]
  return below || above
}

export function inBounds(x: number, y: number): boolean {
  return x >= 0 && x < 9 && y >= 0 && y < 9
}

/** Geometric legality only (bounds + no overlap + no crossing). Does NOT check path enclosure. */
export function canPlaceWallGeometry(walls: Walls, x: number, y: number, o: Orientation): boolean {
  if (x < 0 || x >= WALL_FIELDS || y < 0 || y >= WALL_FIELDS) return false
  if (o === 'H') {
    if (walls.horizontal[x][y]) return false // occupied (identical)
    if (x >= 1 && walls.horizontal[x - 1][y]) return false // overlap to the left
    if (x <= WALL_FIELDS - 2 && walls.horizontal[x + 1][y]) return false // overlap to the right
    if (walls.vertical[x][y]) return false // crosses a vertical wall
    return true
  }
  if (walls.vertical[x][y]) return false // occupied (identical)
  if (y >= 1 && walls.vertical[x][y - 1]) return false // overlap below
  if (y <= WALL_FIELDS - 2 && walls.vertical[x][y + 1]) return false // overlap above
  if (walls.horizontal[x][y]) return false // crosses a horizontal wall
  return true
}

/** Mutates a walls structure to set the given wall. Caller guarantees geometric legality. */
export function setWall(walls: Walls, x: number, y: number, o: Orientation): void {
  if (o === 'H') walls.horizontal[x][y] = true
  else walls.vertical[x][y] = true
}

/** Returns a new Walls with the given wall added. */
export function withWall(walls: Walls, x: number, y: number, o: Orientation): Walls {
  const next = cloneWalls(walls)
  setWall(next, x, y, o)
  return next
}

export function cellEquals(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.y === b.y
}

export function neighbor(cell: Cell, dx: number, dy: number): Cell {
  return { x: cell.x + dx, y: cell.y + dy }
}
