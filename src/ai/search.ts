// Negamax with alpha-beta pruning + candidate-wall filtering + cheap move ordering +
// a transposition table (Zobrist-hashed) so positions reached more than once aren't re-searched.

import {
  applyMove,
  canPlaceWallGeometry,
  isTerminal,
  isWallLegal,
  opponent,
  pawnDestinations,
  BOARD_SIZE,
  WALL_FIELDS,
  type GameState,
  type Move,
  type Orientation,
  type Player,
  type WallMove,
} from '../engine'
import { evaluate, MATE } from './heuristic'

const WALL_ANCHOR_MAX = 8 // walls indexed 0..7
const MAX_WALL_MOVES = 24 // cap branching from wall placements

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/** Chebyshev distance from a wall anchor's surrounding 2x2 cells to a target cell. */
function anchorDistance(x: number, y: number, tx: number, ty: number): number {
  const cx = clamp(tx, x, x + 1)
  const cy = clamp(ty, y, y + 1)
  return Math.max(Math.abs(tx - cx), Math.abs(ty - cy))
}

/**
 * Legal wall placements near the pawns: within `R` of the opponent, or adjacent to self.
 * Filtering to the action zone keeps branching factor manageable while still considering
 * every wall that could realistically change the shortest paths.
 */
export function candidateWallMoves(state: GameState, R = 1): WallMove[] {
  const player = state.turn
  if (state.wallsLeft[player] <= 0) return [] // no walls left to place
  const oppPos = state.positions[opponent(player)]
  const mePos = state.positions[player]
  const out: WallMove[] = []
  const orientations: Orientation[] = ['H', 'V']
  for (let x = 0; x < WALL_ANCHOR_MAX; x++) {
    for (let y = 0; y < WALL_ANCHOR_MAX; y++) {
      const nearOpp = anchorDistance(x, y, oppPos.x, oppPos.y) <= R
      const nearMe = anchorDistance(x, y, mePos.x, mePos.y) <= 1
      if (!nearOpp && !nearMe) continue
      for (const o of orientations) {
        if (!canPlaceWallGeometry(state.walls, x, y, o)) continue
        if (!isWallLegal(state, x, y, o)) continue
        out.push({ type: 'wall', player, x, y, orientation: o })
      }
    }
  }
  // Keep the closest-to-opponent walls first; cap the total to bound branching.
  out.sort((a, b) => anchorDistance(a.x, a.y, oppPos.x, oppPos.y) - anchorDistance(b.x, b.y, oppPos.x, oppPos.y))
  return out.slice(0, MAX_WALL_MOVES)
}

/** Ordered move list: pawn moves (most progressive first) then nearby walls. */
export function orderedMoves(state: GameState, R = 1): Move[] {
  const player = state.turn
  const pawnMoves: Move[] = pawnDestinations(state, player).map((to) => ({ type: 'pawn', player, to }))
  pawnMoves.sort((a, b) => {
    const ay = a.type === 'pawn' ? a.to.y : 0
    const by = b.type === 'pawn' ? b.to.y : 0
    return player === 'white' ? by - ay : ay - by
  })
  return pawnMoves.concat(candidateWallMoves(state, R))
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// ─── Zobrist hashing ────────────────────────────────────────────────────────────
// A 64-bit key (two signed 32-bit halves) built by XOR-ing a random per feature:
// each pawn's cell, every placed wall, each side's remaining wall count, and the side to move.
// JS bitwise ops are 32-bit, so we keep both halves as native int32 (Int32Array round-trips them).

interface ZPair {
  hi: number
  lo: number
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return (t ^ (t >>> 14)) >>> 0
  }
}

function buildZobrist() {
  const rand = mulberry32(0x9e3779b9)
  const pair = (): ZPair => ({ hi: rand(), lo: rand() })
  const pawn: Record<Player, ZPair[]> = {
    white: Array.from({ length: BOARD_SIZE * BOARD_SIZE }, pair),
    black: Array.from({ length: BOARD_SIZE * BOARD_SIZE }, pair),
  }
  const grid = (): ZPair[][] =>
    Array.from({ length: WALL_FIELDS }, () => Array.from({ length: WALL_FIELDS }, pair))
  // wallsLeft is part of the key: identical boards can be reached with different walls remaining,
  // which changes both the evaluation and the resources available — they must not collide.
  const wallsW = Array.from({ length: 11 }, pair)
  const wallsB = Array.from({ length: 11 }, pair)
  return { pawn, wall: { H: grid(), V: grid() }, wallsW, wallsB, side: pair() }
}

const Z = buildZobrist()

export function hashState(state: GameState): ZPair {
  let hi = 0
  let lo = 0
  const w = state.positions.white
  const zw = Z.pawn.white[w.y * BOARD_SIZE + w.x]
  hi ^= zw.hi
  lo ^= zw.lo
  const b = state.positions.black
  const zb = Z.pawn.black[b.y * BOARD_SIZE + b.x]
  hi ^= zb.hi
  lo ^= zb.lo
  const H = state.walls.horizontal
  const V = state.walls.vertical
  for (let x = 0; x < WALL_FIELDS; x++) {
    for (let y = 0; y < WALL_FIELDS; y++) {
      if (H[x][y]) {
        const z = Z.wall.H[x][y]
        hi ^= z.hi
        lo ^= z.lo
      }
      if (V[x][y]) {
        const z = Z.wall.V[x][y]
        hi ^= z.hi
        lo ^= z.lo
      }
    }
  }
  const zW = Z.wallsW[state.wallsLeft.white]
  hi ^= zW.hi
  lo ^= zW.lo
  const zB = Z.wallsB[state.wallsLeft.black]
  hi ^= zB.hi
  lo ^= zB.lo
  if (state.turn === 'black') {
    hi ^= Z.side.hi
    lo ^= Z.side.lo
  }
  return { hi, lo }
}

/** Incremental child hash: apply one move's deltas to the parent hash (no full re-hash). */
export function childHash(hashHi: number, hashLo: number, state: GameState, move: Move): ZPair {
  let hi = hashHi ^ Z.side.hi // turn always flips
  let lo = hashLo ^ Z.side.lo
  if (move.type === 'pawn') {
    const p = move.player
    const from = state.positions[p]
    const zOld = Z.pawn[p][from.y * BOARD_SIZE + from.x]
    const zNew = Z.pawn[p][move.to.y * BOARD_SIZE + move.to.x]
    hi ^= zOld.hi ^ zNew.hi
    lo ^= zOld.lo ^ zNew.lo
  } else {
    const z = Z.wall[move.orientation][move.x][move.y]
    hi ^= z.hi
    lo ^= z.lo
    if (move.player === 'white') {
      const w = state.wallsLeft.white
      hi ^= Z.wallsW[w].hi ^ Z.wallsW[w - 1].hi
      lo ^= Z.wallsW[w].lo ^ Z.wallsW[w - 1].lo
    } else {
      const b = state.wallsLeft.black
      hi ^= Z.wallsB[b].hi ^ Z.wallsB[b - 1].hi
      lo ^= Z.wallsB[b].lo ^ Z.wallsB[b - 1].lo
    }
  }
  return { hi, lo }
}

// ─── Transposition table ────────────────────────────────────────────────────────

const TT_SIZE = 1 << 18 // 262k slots (~3.5 MB); allocated once, cleared per search
const TT_MASK = TT_SIZE - 1
const FLAG_EXACT = 0
const FLAG_LOWER = 1 // value is a lower bound (beta cutoff)
const FLAG_UPPER = 2 // value is an upper bound (fail-low)
const MATE_THRESHOLD = MATE - 1000 // scores within this of ±MATE are mate distances

// Late-move reductions: after the first few (best-ordered) moves, search the rest one ply
// shallower, and re-search at full depth only if a reduced move surprises (lands inside the
// window). Trades a little accuracy on moves that look bad for reaching a deeper ply overall.
const LMR_MIN_DEPTH = 3 // only reduce when at least this much depth remains
const LMR_FULL_MOVES = 3 // search this many moves at full depth before reducing the rest

class TT {
  keyHi: Int32Array
  keyLo: Int32Array
  depth: Int8Array // -1 marks an empty slot
  value: Int32Array
  flag: Int8Array

  constructor() {
    this.keyHi = new Int32Array(TT_SIZE)
    this.keyLo = new Int32Array(TT_SIZE)
    this.depth = new Int8Array(TT_SIZE).fill(-1)
    this.value = new Int32Array(TT_SIZE)
    this.flag = new Int8Array(TT_SIZE)
  }

  clear(): void {
    this.depth.fill(-1)
  }
}

const sharedTT = new TT()

/** Mate scores encode the absolute ply of the mate, so they're root-dependent. Store them
 *  node-relative (add/subtract ply) and undo that on load — otherwise a cached mate distance
 *  would be wrong at a different ply and cause incorrect cutoffs. */
function ttEncode(value: number, ply: number): number {
  if (value > MATE_THRESHOLD) return value + ply
  if (value < -MATE_THRESHOLD) return value - ply
  return value
}
function ttDecode(value: number, ply: number): number {
  if (value > MATE_THRESHOLD) return value - ply
  if (value < -MATE_THRESHOLD) return value + ply
  return value
}

export interface SearchContext {
  deadline?: number
  killers: Move[][]
  tt: TT
}

/** Start a fresh top-level search: clear the shared TT and bind a new killer table to it. */
export function makeCtx(deadline?: number): SearchContext {
  sharedTT.clear()
  return { deadline, killers: [], tt: sharedTT }
}

export function negamax(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
  ctx: SearchContext,
  hashHi: number,
  hashLo: number,
): number {
  if (isTerminal(state)) return -(MATE - ply) // side to move has lost
  if (depth === 0) return evaluate(state)
  if (ctx.deadline !== undefined && now() > ctx.deadline) return evaluate(state)

  const tt = ctx.tt
  const idx = hashLo & TT_MASK
  const alphaOrig = alpha

  // Probe: act only on a definitive result (exact, or a bound that forces a cutoff). We do not
  // narrow α/β from TT bounds — slightly less efficient, but unambiguously correct.
  if (tt.depth[idx] >= depth && tt.keyHi[idx] === hashHi && tt.keyLo[idx] === hashLo) {
    const v = ttDecode(tt.value[idx], ply)
    const f = tt.flag[idx]
    if (f === FLAG_EXACT) return v
    if (f === FLAG_LOWER && v >= beta) return v
    if (f === FLAG_UPPER && v <= alpha) return v
  }

  const km = ctx.killers
  const moves = orderedMoves(state, 1)
  orderWithKillers(moves, km[ply]) // cutoff-prone moves first → tighter alpha-beta
  let best = -Infinity
  let timedOut = false
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i]
    const ch = childHash(hashHi, hashLo, state, m)
    const childState = applyMove(state, m)
    let val: number
    if (depth >= LMR_MIN_DEPTH && i >= LMR_FULL_MOVES) {
      // Search late, badly-ordered moves one ply shallower…
      val = -negamax(childState, depth - 2, -beta, -alpha, ply + 1, ctx, ch.hi, ch.lo)
      if (val > alpha && val < beta) {
        // …and only if it lands inside the window (might actually be good) re-search at full depth.
        val = -negamax(childState, depth - 1, -beta, -alpha, ply + 1, ctx, ch.hi, ch.lo)
      }
    } else {
      val = -negamax(childState, depth - 1, -beta, -alpha, ply + 1, ctx, ch.hi, ch.lo)
    }
    if (val > best) best = val
    if (best > alpha) alpha = best
    if (alpha >= beta) {
      recordKiller(km, ply, m) // remember what caused the cutoff for sibling nodes
      break
    }
    if (ctx.deadline !== undefined && now() > ctx.deadline) {
      timedOut = true
      break
    }
  }

  // Store only fully-completed nodes; a deadline-truncated search is unreliable. (A child timeout
  // makes now() > deadline, so the parent breaks above too — stored entries are always clean.)
  if (!timedOut) {
    let flag: number
    if (best <= alphaOrig) flag = FLAG_UPPER
    else if (best >= beta) flag = FLAG_LOWER
    else flag = FLAG_EXACT
    tt.keyHi[idx] = hashHi
    tt.keyLo[idx] = hashLo
    tt.depth[idx] = depth
    tt.value[idx] = ttEncode(best, ply)
    tt.flag[idx] = flag
  }

  return best
}

/**
 * Killer-move heuristic: at a given ply, beta-cutoff moves tend to cut off siblings too, so try
 * the last two cutoff moves there before the normally-ordered list. Ordering-only — it never
 * changes which move is best, just how fast we prove it.
 */
function orderWithKillers(moves: Move[], slot: Move[] | undefined): void {
  if (!slot) return
  for (let k = slot.length - 1; k >= 0; k--) {
    const killer = slot[k]
    if (!killer) continue
    const i = moves.findIndex((m) => sameMove(m, killer))
    if (i > 0) {
      moves.splice(i, 1)
      moves.unshift(killer)
    }
  }
}

/** Two-slot killer table per ply, most-recent-first; skip duplicates. */
function recordKiller(killers: Move[][], ply: number, move: Move): void {
  const slot = killers[ply] ?? (killers[ply] = [])
  if (slot[0] && sameMove(slot[0], move)) return
  slot[1] = slot[0]
  slot[0] = move
}

interface RootResult {
  move: Move
  complete: boolean
}

/** Structural equality for two moves (pawn destination or wall anchor+orientation). */
function sameMove(a: Move, b: Move): boolean {
  if (a.type !== b.type) return false
  if (a.type === 'pawn' && b.type === 'pawn') return a.to.x === b.to.x && a.to.y === b.to.y
  if (a.type === 'wall' && b.type === 'wall')
    return a.x === b.x && a.y === b.y && a.orientation === b.orientation
  return false
}

/**
 * Search the root: explore every root move fully (no cutoff at beta=Infinity) for accurate values.
 * If `hint` is given (the previous iteration's best move) it is tried first — a good early bound
 * makes alpha-beta prune the rest far harder, which is what lets the deeper searches finish in time.
 * `wallR` widens the candidate-wall radius at the root only (deeper plies stay tight), so the bot
 * can see strategic long-range walls it would otherwise never consider.
 */
export function searchRoot(
  state: GameState,
  depth: number,
  ctx: SearchContext,
  hint?: Move,
  wallR = 1,
  rootHash?: ZPair,
): RootResult {
  const base = rootHash ?? hashState(state)
  const all = orderedMoves(state, wallR)
  let moves: Move[]
  if (hint) {
    const i = all.findIndex((m) => sameMove(m, hint))
    if (i >= 0) {
      // PV first, the rest shuffled to keep variety among equal-valued moves.
      moves = [all[i], ...shuffle(all.slice(0, i)), ...shuffle(all.slice(i + 1))]
    } else {
      moves = shuffle(all)
    }
  } else {
    moves = shuffle(all)
  }
  let best = moves[0]
  let bestVal = -Infinity
  let alpha = -Infinity
  let complete = true
  for (const m of moves) {
    const ch = childHash(base.hi, base.lo, state, m)
    const childState = applyMove(state, m)
    const val = -negamax(childState, depth - 1, -Infinity, -alpha, 0, ctx, ch.hi, ch.lo)
    if (val > bestVal) {
      bestVal = val
      best = m
    }
    if (val > alpha) alpha = val
    if (ctx.deadline !== undefined && now() > ctx.deadline) {
      complete = false
      break
    }
  }
  return { move: best, complete }
}

/** Iterative deepening: keep the move from the deepest fully-completed search, feeding each
 *  iteration's best move forward as an ordering hint to the next, and sharing one killer table
 *  and one transposition table across all depths (shallow entries feed the deeper iterations).
 *  `wallR` (default 2) widens root wall vision — Normal uses the default, Hard passes 3. */
export function searchIterative(state: GameState, maxDepth: number, timeLimitMs: number, wallR = 2): Move {
  const deadline = now() + timeLimitMs
  const ctx = makeCtx(deadline)
  const rootHash = hashState(state)
  let best: Move | undefined
  for (let d = 1; d <= maxDepth; d++) {
    const { move, complete } = searchRoot(state, d, ctx, best, wallR, rootHash)
    if (complete) best = move
    if (!complete || now() > deadline) break
  }
  return best ?? orderedMoves(state, 1)[0]
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}
