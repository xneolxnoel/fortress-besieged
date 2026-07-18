// Top-level AI entry point. Maps a difficulty level to a search configuration.

import { searchIterative, searchRoot, makeCtx } from './search'
import type { GameState, Move } from '../engine'

export type Difficulty = 'easy' | 'normal' | 'hard'

export interface AiRequest {
  state: GameState
  level: Difficulty
  id: number
}

export interface AiResponse {
  id: number
  move?: Move
  error?: string
}

/**
 * Choose a move for the player to move in `state`.
 *   - easy:   negamax depth 2 — a relaxed casual game.
 *   - normal: iterative-deepening negamax (~2000ms budget) with alpha-beta, PV-first + killer-move
 *             ordering, late-move reductions, a transposition table, wider root wall vision (R=2),
 *             and an evaluation that weighs path length, wall count, goal-edge reachability, and a
 *             near-goal "threat" term. LMR + the TT let it reach depth 5 in the opening (and 6–8
 *             mid-game) within the budget.
 *   - hard:   the same engine pushed further — a doubled ~4000ms budget, a depth cap of 10, and
 *             wider root wall vision (R=3), so it searches deeper and sees longer-range wall plays.
 */
export function chooseMove(state: GameState, level: Difficulty): Move {
  switch (level) {
    case 'easy':
      return searchRoot(state, 2, makeCtx()).move
    case 'normal':
      return searchIterative(state, 8, 2000)
    case 'hard':
      return searchIterative(state, 10, 4000, 3)
    default:
      return searchRoot(state, 2, makeCtx()).move
  }
}
