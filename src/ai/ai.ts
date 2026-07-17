// Top-level AI entry point. Maps a difficulty level to a search configuration.

import { searchIterative, searchRoot, orderedMoves, makeCtx } from './search'
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
 *   - easy:   greedy 1-ply, but 40% of the time a random legal move (beatable).
 *   - normal: negamax depth 2.
 *   - hard:   iterative-deepening negamax (~2000ms budget) with alpha-beta, PV-first + killer-move
 *             ordering, late-move reductions, a transposition table, wider root wall vision (R=2),
 *             and an evaluation that weighs path length, wall count, goal-edge reachability, and a
 *             near-goal "threat" term. LMR + the TT let it reach depth 5 in the opening (and 6–8
 *             mid-game) within the budget — up from depth 3 at the start of this work.
 */
export function chooseMove(state: GameState, level: Difficulty): Move {
  switch (level) {
    case 'easy':
      return easyMove(state)
    case 'normal':
      return searchRoot(state, 2, makeCtx()).move
    case 'hard':
      return searchIterative(state, 8, 2000)
    default:
      return searchRoot(state, 2, makeCtx()).move
  }
}

function easyMove(state: GameState): Move {
  const moves = orderedMoves(state, 1)
  if (moves.length === 0) return searchRoot(state, 1, makeCtx()).move
  // 40% pure random — keeps the bot light and beatable.
  if (Math.random() < 0.4) return moves[Math.floor(Math.random() * moves.length)]
  return searchRoot(state, 1, makeCtx()).move
}
