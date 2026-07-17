// Game state lifecycle: initial state, applying moves, win detection.

import { cloneWalls, createWalls, setWall } from './board'
import { isGoalCell } from './pathfind'
import { opponent } from './moves'
import {
  type Cell,
  type GameState,
  type Move,
  type Player,
  type Status,
  PLAYERS,
  START_WALLS,
} from './types'

export function initialState(): GameState {
  const positions: Record<Player, Cell> = {
    white: { x: 4, y: 0 },
    black: { x: 4, y: 8 },
  }
  const wallsLeft: Record<Player, number> = {
    white: START_WALLS,
    black: START_WALLS,
  }
  return {
    positions,
    wallsLeft,
    walls: createWalls(),
    turn: 'white',
    history: [],
    status: 'playing',
  }
}

/** True if the mover has reached their goal edge. */
function hasWon(player: Player, pos: Cell): boolean {
  return isGoalCell(player, pos)
}

/**
 * Apply a (presumed-legal) move immutably and return the next state.
 * The caller is responsible for only passing legal moves (the UI and AI generators do).
 */
export function applyMove(state: GameState, move: Move): GameState {
  if (state.status !== 'playing') return state

  const next: GameState = {
    positions: { white: { ...state.positions.white }, black: { ...state.positions.black } },
    wallsLeft: { ...state.wallsLeft },
    walls: cloneWalls(state.walls),
    turn: state.turn,
    history: state.history.concat(move),
    status: 'playing',
  }

  if (move.type === 'pawn') {
    next.positions[move.player] = { ...move.to }
    if (hasWon(move.player, move.to)) {
      next.status = (move.player === 'white' ? 'white-wins' : 'black-wins') as Status
      return next
    }
  } else {
    setWall(next.walls, move.x, move.y, move.orientation)
    next.wallsLeft[move.player] = state.wallsLeft[move.player] - 1
  }

  next.turn = opponent(state.turn)
  return next
}

/** Rebuild a state by replaying a move list from the initial position (used by undo/resume). */
export function stateFromHistory(moves: Move[]): GameState {
  let s = initialState()
  for (const m of moves) s = applyMove(s, m)
  return s
}

export function isTerminal(state: GameState): boolean {
  return state.status !== 'playing'
}

export function winner(state: GameState): Player | null {
  if (state.status === 'white-wins') return 'white'
  if (state.status === 'black-wins') return 'black'
  return null
}

export { opponent, PLAYERS }
