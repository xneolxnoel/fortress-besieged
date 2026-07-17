// Modern algebraic-ish notation for move lists / logs / sharing.
//   - Cell (x, y): column letter a..i (x=0 → a), row digit 1..9 (y=0 → 1). a1 is bottom-left.
//   - Pawn move: destination cell, e.g. "e2".
//   - Wall move: anchor cell + orientation letter, e.g. "e3v".

import { type Cell, type Move } from './types'

export function cellToNotation(c: Cell): string {
  return `${String.fromCharCode(97 + c.x)}${c.y + 1}`
}

export function moveToNotation(move: Move): string {
  if (move.type === 'pawn') return cellToNotation(move.to)
  return `${cellToNotation({ x: move.x, y: move.y })}${move.orientation === 'H' ? 'h' : 'v'}`
}

/**
 * Format a move history as numbered, white/black-paired rows — the same pairing the move list shows:
 *   "1. e2 e8\n2. e3 e7\n3. e4 d3h\n…"
 * An odd-length tail renders just the white half of the last row. Used for exporting a game record.
 */
export function formatMoveHistory(history: Move[]): string {
  const lines: string[] = []
  for (let i = 0; i < history.length; i += 2) {
    const n = i / 2 + 1
    const white = history[i] ? moveToNotation(history[i]) : ''
    const black = history[i + 1] ? moveToNotation(history[i + 1]) : ''
    lines.push(black ? `${n}. ${white} ${black}` : `${n}. ${white}`)
  }
  return lines.join('\n')
}

export function playerLabel(p: 'white' | 'black'): string {
  return p === 'white' ? 'White' : 'Black'
}
