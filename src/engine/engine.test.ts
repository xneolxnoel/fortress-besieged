import { describe, it, expect } from 'vitest'
import {
  applyMove,
  canPlaceWallGeometry,
  cellToNotation,
  createWalls,
  formatMoveHistory,
  hasPath,
  initialState,
  isTerminal,
  legalMoves,
  moveToNotation,
  opponent,
  pawnDestinations,
  isWallLegal,
  playerDistance,
  playerPathInfo,
  setWall,
  shortestPath,
  stateFromHistory,
  winner,
} from './index'
import type { Cell, GameState, Move, Orientation, Player } from './types'

function stateWith(opts: {
  white?: Cell
  black?: Cell
  turn?: Player
  walls?: Array<[number, number, Orientation]>
}): GameState {
  const s = initialState()
  if (opts.white) s.positions.white = { ...opts.white }
  if (opts.black) s.positions.black = { ...opts.black }
  if (opts.turn) s.turn = opts.turn
  for (const [x, y, o] of opts.walls ?? []) setWall(s.walls, x, y, o)
  return s
}

const key = (c: Cell) => `${c.x},${c.y}`

describe('opponent', () => {
  it('flips players', () => {
    expect(opponent('white')).toBe('black')
    expect(opponent('black')).toBe('white')
  })
})

describe('pathfinding', () => {
  it('computes straight-line distance on an empty board', () => {
    const w = createWalls()
    expect(shortestPath({ x: 4, y: 0 }, (c) => c.y === 8, w)).toBe(8)
    expect(shortestPath({ x: 0, y: 0 }, (c) => c.y === 8, w)).toBe(8)
    expect(playerDistance('white', { x: 4, y: 0 }, w)).toBe(8)
    expect(playerDistance('white', { x: 4, y: 8 }, w)).toBe(0) // already at goal
  })

  it('detects a fully enclosed pawn (no path to goal)', () => {
    // V(0,0) seals col0/col1 for rows 0-1; H(0,1) seals (0,1)-(0,2).
    // White at (0,0) is then stuck in {(0,0),(0,1)} with no route to row 8.
    const w = createWalls()
    setWall(w, 0, 0, 'V')
    setWall(w, 0, 1, 'H')
    expect(hasPath({ x: 0, y: 0 }, (c) => c.y === 8, w)).toBe(false)
    expect(shortestPath({ x: 0, y: 0 }, (c) => c.y === 8, w)).toBe(Infinity)
    // A free pawn elsewhere is fine
    expect(hasPath({ x: 4, y: 4 }, (c) => c.y === 8, w)).toBe(true)
  })

  it('playerPathInfo reports distance + reachable goal cells', () => {
    const empty = createWalls()
    // On an open board, white at the centre can reach all 9 cells of its goal row (row 8).
    const open = playerPathInfo('white', { x: 4, y: 4 }, empty)
    expect(open.distance).toBe(playerDistance('white', { x: 4, y: 4 }, empty))
    expect(open.goalReach).toBe(9)
    // A pawn already on its goal row is at distance 0; it can still roam the whole row, so all 9
    // goal cells remain reachable.
    expect(playerPathInfo('white', { x: 4, y: 8 }, empty)).toEqual({ distance: 0, goalReach: 9 })
    // The enclosed pawn from the test above can reach zero goal cells.
    const stuck = createWalls()
    setWall(stuck, 0, 0, 'V')
    setWall(stuck, 0, 1, 'H')
    expect(playerPathInfo('white', { x: 0, y: 0 }, stuck)).toEqual({ distance: Infinity, goalReach: 0 })
  })
})

describe('wall geometry', () => {
  it('rejects occupancy, overlap, crossing, and out-of-bounds', () => {
    const w = createWalls()
    expect(canPlaceWallGeometry(w, 0, 0, 'H')).toBe(true)
    setWall(w, 0, 0, 'H')
    expect(canPlaceWallGeometry(w, 0, 0, 'H')).toBe(false) // identical / occupied
    expect(canPlaceWallGeometry(w, 1, 0, 'H')).toBe(false) // overlaps left neighbour
    expect(canPlaceWallGeometry(w, 2, 0, 'H')).toBe(true) // end-to-end is allowed
    expect(canPlaceWallGeometry(w, 0, 0, 'V')).toBe(false) // crosses H(0,0)
    expect(canPlaceWallGeometry(w, -1, 0, 'H')).toBe(false) // out of bounds
  })
})

describe('wall path legality', () => {
  it('rejects a wall that would enclose a player, accepts a harmless one', () => {
    const s = stateWith({ white: { x: 0, y: 0 }, black: { x: 8, y: 8 }, walls: [[0, 0, 'V']] })
    expect(isWallLegal(s, 0, 1, 'H')).toBe(false) // would seal white in {(0,0),(0,1)}
    expect(isWallLegal(s, 5, 5, 'H')).toBe(true) // harmless
  })
})

describe('pawn movement', () => {
  it('produces 3 destinations for the start position', () => {
    const dests = pawnDestinations(initialState(), 'white').map(key)
    expect(dests.sort()).toEqual(['3,0', '4,1', '5,0'])
  })

  it('jumps straight over an adjacent opponent', () => {
    const s = stateWith({ white: { x: 4, y: 4 }, black: { x: 4, y: 5 } })
    const dests = pawnDestinations(s, 'white').map(key)
    expect(dests).toContain('4,6') // jumped over black
    expect(dests).not.toContain('4,5') // occupied square not a destination
    expect(dests).toContain('4,3')
    expect(dests).toContain('3,4')
    expect(dests).toContain('5,4')
  })

  it('diagonal-sidesteps when the straight jump is blocked by a wall', () => {
    const s = stateWith({ white: { x: 4, y: 4 }, black: { x: 4, y: 5 }, walls: [[4, 5, 'H']] })
    const dests = pawnDestinations(s, 'white').map(key)
    expect(dests).toContain('3,5') // sidestep left
    expect(dests).toContain('5,5') // sidestep right
    expect(dests).not.toContain('4,6') // straight jump blocked
  })

  it('diagonal-sidesteps at the board edge', () => {
    // White at (4,7), black at (4,8) on the top edge; the square beyond is off-board -> sidestep.
    const s = stateWith({ white: { x: 4, y: 7 }, black: { x: 4, y: 8 } })
    const dests = pawnDestinations(s, 'white').map(key)
    expect(dests).toContain('3,8') // sidestep left
    expect(dests).toContain('5,8') // sidestep right
    expect(dests).not.toContain('4,8') // occupied by black
  })
})

describe('move generation', () => {
  it('yields 131 legal moves from the start (3 pawn + 128 walls)', () => {
    expect(legalMoves(initialState()).length).toBe(131)
  })

  it('does not offer walls when the player has none left', () => {
    const s = stateWith({ white: { x: 4, y: 4 }, black: { x: 4, y: 5 } })
    s.wallsLeft.white = 0
    const moves = legalMoves(s)
    expect(moves.every((m) => m.type === 'pawn' || m.player !== 'white')).toBe(true)
  })
})

describe('applyMove / lifecycle', () => {
  it('switches turn on a pawn move and decrements walls on a wall move', () => {
    let s = initialState()
    s = applyMove(s, { type: 'pawn', player: 'white', to: { x: 4, y: 1 } })
    expect(s.turn).toBe('black')
    expect(s.positions.white).toEqual({ x: 4, y: 1 })
    s = applyMove(s, { type: 'wall', player: 'black', x: 3, y: 6, orientation: 'V' })
    expect(s.wallsLeft.black).toBe(9)
    expect(s.turn).toBe('white')
    expect(s.history.length).toBe(2)
  })

  it('ends the game when a pawn reaches its goal edge', () => {
    let s = stateWith({ white: { x: 4, y: 7 }, black: { x: 4, y: 1 } })
    s = applyMove(s, { type: 'pawn', player: 'white', to: { x: 4, y: 8 } })
    expect(s.status).toBe('white-wins')
    expect(isTerminal(s)).toBe(true)
    expect(winner(s)).toBe('white')
  })

  it('stateFromHistory replays a move list deterministically', () => {
    const moves: Move[] = [
      { type: 'pawn', player: 'white', to: { x: 4, y: 1 } },
      { type: 'pawn', player: 'black', to: { x: 4, y: 7 } },
      { type: 'wall', player: 'white', x: 3, y: 6, orientation: 'V' },
    ]
    const s = stateFromHistory(moves)
    expect(s.positions.white).toEqual({ x: 4, y: 1 })
    expect(s.positions.black).toEqual({ x: 4, y: 7 })
    expect(s.wallsLeft.white).toBe(9)
    expect(s.turn).toBe('black')
    expect(s.history).toEqual(moves)
  })
})

describe('notation', () => {
  it('encodes cells and moves', () => {
    expect(cellToNotation({ x: 0, y: 0 })).toBe('a1')
    expect(cellToNotation({ x: 8, y: 8 })).toBe('i9')
    expect(cellToNotation({ x: 4, y: 1 })).toBe('e2')
    expect(
      moveToNotation({ type: 'wall', player: 'white', x: 4, y: 2, orientation: 'V' }),
    ).toBe('e3v')
    expect(
      moveToNotation({ type: 'wall', player: 'white', x: 4, y: 2, orientation: 'H' }),
    ).toBe('e3h')
    expect(moveToNotation({ type: 'pawn', player: 'white', to: { x: 4, y: 1 } })).toBe('e2')
  })

  it('formatMoveHistory pairs moves into numbered white/black rows', () => {
    const e2: Move = { type: 'pawn', player: 'white', to: { x: 4, y: 1 } }
    const e8: Move = { type: 'pawn', player: 'black', to: { x: 4, y: 7 } }
    const d3h: Move = { type: 'wall', player: 'white', x: 3, y: 2, orientation: 'H' }
    expect(formatMoveHistory([e2, e8, d3h])).toBe('1. e2 e8\n2. d3h')
    expect(formatMoveHistory([e2, e8])).toBe('1. e2 e8')
    expect(formatMoveHistory([e2])).toBe('1. e2') // odd-length tail: white half only
    expect(formatMoveHistory([])).toBe('')
  })
})
