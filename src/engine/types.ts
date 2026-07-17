// Core types and constants for the Fortress Besieged rules engine.
//
// Coordinate system:
//   - Cells are (x, y) with x = column 0..8 (left → right), y = row 0..8 (bottom → top).
//   - White starts at (4, 0) and races to row 8 (top). Black starts at (4, 8) and races to row 0.
//
// Walls:
//   - A wall is length-2 and is anchored at a "northwest cell" corner (x, y) with x, y in 0..7.
//   - Horizontal wall (x, y): sits on the TOP edge of cells (x, y) and (x+1, y). Blocks vertical
//     movement (between rows y and y+1) for columns x and x+1.
//   - Vertical wall (x, y): sits on the RIGHT edge of cells (x, y) and (x, y+1). Blocks horizontal
//     movement (between columns x and x+1) for rows y and y+1.

export type Player = 'white' | 'black'
export type Orientation = 'H' | 'V'

export interface Cell {
  x: number
  y: number
}

export interface PawnMove {
  type: 'pawn'
  player: Player
  to: Cell
}

export interface WallMove {
  type: 'wall'
  player: Player
  x: number // 0..7 anchor (northwest cell)
  y: number // 0..7
  orientation: Orientation
}

export type Move = PawnMove | WallMove

export interface Walls {
  /** horizontal[x][y]: horizontal wall anchored at (x, y), x,y in 0..7 */
  horizontal: boolean[][]
  /** vertical[x][y]: vertical wall anchored at (x, y), x,y in 0..7 */
  vertical: boolean[][]
}

export type Status = 'playing' | 'white-wins' | 'black-wins'

export interface GameState {
  positions: Record<Player, Cell>
  wallsLeft: Record<Player, number>
  walls: Walls
  turn: Player
  history: Move[]
  status: Status
}

export const BOARD_SIZE = 9 // 9x9 cells
export const WALL_FIELDS = 8 // 8x8 wall anchor grid
export const START_WALLS = 10 // 2-player: 10 walls each

export const PLAYERS: Player[] = ['white', 'black']
