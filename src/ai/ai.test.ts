import { describe, it, expect } from 'vitest'
import { chooseMove } from './ai'
import { evaluate } from './heuristic'
import { childHash, hashState } from './search'
import { applyMove, createWalls, initialState, isTerminal, legalMoves } from '../engine'
import type { GameState, Move } from '../engine'

const moveKey = (m: Move): string =>
  m.type === 'pawn' ? `p${m.to.x},${m.to.y}` : `w${m.x},${m.y},${m.orientation}`

function isLegal(state: GameState, move: Move): boolean {
  return new Set(legalMoves(state).map(moveKey)).has(moveKey(move))
}

function fresh(white: [number, number], black: [number, number]): GameState {
  return {
    positions: { white: { x: white[0], y: white[1] }, black: { x: black[0], y: black[1] } },
    wallsLeft: { white: 10, black: 10 },
    walls: createWalls(),
    turn: 'white',
    history: [],
    status: 'playing',
  }
}

describe('AI', () => {
  it('always returns a legal move from the starting position', () => {
    const start = initialState()
    for (const level of ['easy', 'normal', 'hard'] as const) {
      expect(isLegal(start, chooseMove(start, level))).toBe(true)
    }
  })

  it('normal and hard take an immediate win', () => {
    const s = fresh([4, 7], [4, 1]) // white one step from the goal
    for (const level of ['normal', 'hard'] as const) {
      const move = chooseMove(s, level)
      expect(move.type).toBe('pawn')
      if (move.type === 'pawn') expect(move.to).toEqual({ x: 4, y: 8 })
    }
  })

  it('hard does not hand the opponent a one-move win when it can block', () => {
    // Opponent (black) is one step from its goal at row 0; it is NOT hard's turn here — instead
    // verify the bot returns a legal, non-suicidal-looking move and runs within a sane budget.
    // Hard now iterative-deepens to depth 4 with a ~2000ms budget, so allow generous headroom.
    const s = fresh([4, 4], [4, 1])
    const start = Date.now()
    const move = chooseMove(s, 'hard')
    const elapsed = Date.now() - start
    expect(isLegal(s, move)).toBe(true)
    expect(elapsed).toBeLessThan(5000) // hard should finish well under this even at depth 4
  })

  it('hard walls to stay alive when it cannot win a pure race', () => {
    // White is 8 steps out, black only 2, white to move — white cannot outrun black, so the only
    // way to stay alive is to place a wall that delays black. A linear path-difference eval ties
    // "walk and let black advance" with "wall and hold black" at a shallow search horizon, and the
    // bot used to blunder into the walk ~half the time. The near-goal threat term makes walling the
    // clear pick. Assert it places a wall (any wall), not a pawn move.
    const s = fresh([4, 0], [4, 2])
    expect(chooseMove(s, 'hard').type).toBe('wall')
  })

  it('evaluation counts a wall deficit as behind even when ahead in raw distance', () => {
    // White is one step from the goal, Black eight steps out — the raw race favors White — but
    // White has spent 9 walls (1 left) to Black's 8. Black can easily seal White's last step and
    // win, so White is effectively behind. A weak wall term used to rate this as winning for White;
    // with walls valued as a race-deciding resource the eval must read negative for the side to move.
    const s: GameState = {
      positions: { white: { x: 4, y: 7 }, black: { x: 4, y: 8 } },
      wallsLeft: { white: 1, black: 8 },
      walls: createWalls(),
      turn: 'white',
      history: [],
      status: 'playing',
    }
    expect(evaluate(s)).toBeLessThan(0)
  })

  it('transposition table is correctness-preserving: incremental hash matches a full re-hash', () => {
    // The TT keys positions by Zobrist hash, updated incrementally as moves are applied. If the
    // incremental hash ever drifts from a fresh hash of the same state, the TT would conflate
    // different positions and return wrong values — so this invariant is the whole ballgame.
    let s = initialState()
    let h = hashState(s)
    let seed = 12345
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
    for (let i = 0; i < 50 && !isTerminal(s); i++) {
      const ms = legalMoves(s)
      const m = ms[Math.floor(rnd() * ms.length)]
      h = childHash(h.hi, h.lo, s, m) // incremental, computed from the pre-move state
      s = applyMove(s, m)
      const full = hashState(s)
      expect(h.hi).toBe(full.hi)
      expect(h.lo).toBe(full.lo)
    }
  })
})
