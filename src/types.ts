import type { Difficulty } from './ai/ai'
import type { Player } from './engine/types'

export type Mode = 'hotseat' | 'ai'

export interface Settings {
  mode: Mode
  /** Used when mode === 'ai'. */
  difficulty: Difficulty
  /** Color the AI controls when mode === 'ai'. */
  aiSide: Player
}

export const DEFAULT_SETTINGS: Settings = {
  mode: 'hotseat',
  difficulty: 'normal',
  aiSide: 'black',
}

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'Easy',
  normal: 'Normal',
  hard: 'Hard',
}

export type { Difficulty }
