// Full-game self-play: proves the engine + AI loop only ever emits legal moves and always
// reaches a terminal state (no illegal placements, no hangs).

import { describe, it, expect } from 'vitest'
import { chooseMove } from './ai'
import { applyMove, initialState, isTerminal, legalMoves, winner, type GameState, type Move } from '../engine'

const moveKey = (m: Move): string =>
  m.type === 'pawn' ? `p${m.to.x},${m.to.y}` : `w${m.x},${m.y},${m.orientation}`

function play(levels: { white: 'easy' | 'normal'; black: 'easy' | 'normal' }, cap: number): GameState {
  let state = initialState()
  let n = 0
  while (!isTerminal(state) && n < cap) {
    const level = state.turn === 'white' ? levels.white : levels.black
    const move = chooseMove(state, level)
    const legalKeys = new Set(legalMoves(state).map(moveKey))
    if (!legalKeys.has(moveKey(move)) && state.status === 'playing') {
      throw new Error(`AI returned an illegal move on ply ${n}: ${moveKey(move)}`)
    }
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
  })

  it('normal vs normal finishes a legal, complete game', () => {
    const final = play({ white: 'normal', black: 'normal' }, 400)
    expect(isTerminal(final)).toBe(true)
    expect(winner(final)).not.toBeNull()
  }, 30000)
})
