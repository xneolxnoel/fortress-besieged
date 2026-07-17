// Shortest-path / reachability via BFS on the 9x9 cell graph.
// Edges exist between orthogonally adjacent cells unless a wall blocks them.

import { isEdgeBlocked } from './board'
import { BOARD_SIZE, type Cell, type Player, type Walls } from './types'

/** Row a player must reach to win: white → 8 (top), black → 0 (bottom). */
export function goalRow(player: Player): number {
  return player === 'white' ? BOARD_SIZE - 1 : 0
}

export function isGoalCell(player: Player, c: Cell): boolean {
  return c.y === goalRow(player)
}

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const

/**
 * Shortest number of steps from `start` to any cell satisfying `isGoal`.
 * Returns `Infinity` if no path exists.
 */
export function shortestPath(start: Cell, isGoal: (c: Cell) => boolean, walls: Walls): number {
  if (isGoal(start)) return 0
  const visited = new Uint8Array(BOARD_SIZE * BOARD_SIZE)
  const idx = (x: number, y: number) => y * BOARD_SIZE + x
  // Queue holds flat indices; parallel array holds distances.
  const queue = new Int32Array(BOARD_SIZE * BOARD_SIZE)
  const dist = new Int16Array(BOARD_SIZE * BOARD_SIZE)
  let head = 0
  let tail = 0
  queue[tail] = idx(start.x, start.y)
  dist[tail] = 0
  visited[idx(start.x, start.y)] = 1
  tail++
  while (head < tail) {
    const flat = queue[head]
    const d = dist[head]
    head++
    const cx = flat % BOARD_SIZE
    const cy = (flat / BOARD_SIZE) | 0
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx
      const ny = cy + dy
      if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE) continue
      if (isEdgeBlocked(walls, cx, cy, nx, ny)) continue
      const ni = idx(nx, ny)
      if (visited[ni]) continue
      if (isGoal({ x: nx, y: ny })) return d + 1
      visited[ni] = 1
      queue[tail] = ni
      dist[tail] = d + 1
      tail++
    }
  }
  return Infinity
}

/** True if at least one path exists from `start` to any goal cell. */
export function hasPath(start: Cell, isGoal: (c: Cell) => boolean, walls: Walls): boolean {
  return shortestPath(start, isGoal, walls) !== Infinity
}

/** Shortest path length for a given player to their goal edge. */
export function playerDistance(player: Player, pos: Cell, walls: Walls): number {
  return shortestPath(pos, (c) => isGoalCell(player, c), walls)
}

export interface PathInfo {
  /** Shortest steps to any goal cell, or `Infinity` if none reachable. */
  distance: number
  /** How many distinct goal-edge cells are reachable (0..BOARD_SIZE). More = harder to wall off. */
  goalReach: number
}

/**
 * Full BFS from `pos`: returns both the shortest distance to any goal cell AND the count of
 * reachable goal-edge cells. Same single traversal the AI eval needs, so distance + robustness
 * come for the price of one search.
 */
export function playerPathInfo(player: Player, pos: Cell, walls: Walls): PathInfo {
  const goal = goalRow(player)
  const idx = (x: number, y: number) => y * BOARD_SIZE + x
  const visited = new Uint8Array(BOARD_SIZE * BOARD_SIZE)
  const queue = new Int32Array(BOARD_SIZE * BOARD_SIZE)
  const dist = new Int16Array(BOARD_SIZE * BOARD_SIZE) // parallel to `queue` (indexed by position in it)
  let head = 0
  let tail = 0
  queue[tail] = idx(pos.x, pos.y)
  dist[tail] = 0
  visited[idx(pos.x, pos.y)] = 1
  tail++
  let distance = Infinity
  let goalReach = pos.y === goal ? 1 : 0
  if (pos.y === goal) distance = 0
  while (head < tail) {
    const flat = queue[head]
    const d = dist[head]
    head++
    const cx = flat % BOARD_SIZE
    const cy = (flat / BOARD_SIZE) | 0
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx
      const ny = cy + dy
      if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE) continue
      if (isEdgeBlocked(walls, cx, cy, nx, ny)) continue
      const ni = idx(nx, ny)
      if (visited[ni]) continue
      visited[ni] = 1
      if (ny === goal) {
        goalReach++
        if (!Number.isFinite(distance)) distance = d + 1 // BFS order → first hit is the shortest
      }
      queue[tail] = ni
      dist[tail] = d + 1
      tail++
    }
  }
  return { distance, goalReach }
}
