// Full-game self-play: proves the engine + AI loop only ever emits legal moves and always
// reaches a terminal state (no illegal placements, no hangs).

import { describe, it, expect } from 'vitest'
import { chooseMove, type Difficulty } from './ai'
import { applyMove, initialState, isTerminal, legalMoves, winner, type GameState, type Move } from '../engine'

const moveKey = (m: Move): string =>
  m.type === 'pawn' ? `p${m.to.x},${m.to.y}` : `w${m.x},${m.y},${m.orientation}`

function assertLegal(state: GameState, move: Move, ply: number): void {
  const legalKeys = new Set(legalMoves(state).map(moveKey))
  if (!legalKeys.has(moveKey(move)) && state.status === 'playing') {
    throw new Error(`AI returned an illegal move on ply ${ply}: ${moveKey(move)}`)
  }
}

function play(levels: { white: Difficulty; black: Difficulty }, cap: number): GameState {
  let state = initialState()
  let n = 0
  while (!isTerminal(state) && n < cap) {
    const level = state.turn === 'white' ? levels.white : levels.black
    const move = chooseMove(state, level)
    assertLegal(state, move, n)
    state = applyMove(state, move)
    n++
  }
  return state
}

describe('AI self-play', () => {
  it('easy vs easy finishes a legal, complete game', () => {
    const final = play({ white: 'easy', black: 'easy' }, 400)
    expect(isTerminal(final)).toBe(true)
    expect(winner(final)).not.toBeNull()
  }, 30000)

  it('normal emits only legal moves (bounded probe)', () => {
    // Normal runs iterative deepening with a ~2000ms budget per move, so a full game is too slow
    // for a test. A handful of plies is enough to exercise the search + engine loop and prove
    // every emitted move is legal; easy vs easy above covers termination.
    const final = play({ white: 'normal', black: 'normal' }, 6)
    expect(final.history.length).toBeGreaterThan(0)
  }, 30000)
})
