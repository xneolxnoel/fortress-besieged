// Central game controller: holds engine state, drives the AI worker, handles undo + persistence,
// and plays a sound cue on every move.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  applyMove,
  initialState,
  opponent,
  stateFromHistory,
  type GameState,
  type Move,
  type Player,
} from '../engine'
import { playMove as playMoveSound, playWall as playWallSound, setMuted } from '../audio'
import type { Settings } from '../types'
import { DEFAULT_SETTINGS } from '../types'

const STORAGE_KEY = 'fortress-besieged.v1'
const MUTE_KEY = 'fortress-besieged.muted'
const MIN_AI_THINK_MS = 300 // minimum visible "thinking" time so the AI never snaps instantly

// Single shared worker for the whole app lifetime.
const worker = new Worker(new URL('../ai/worker.ts', import.meta.url), { type: 'module' })

interface SavedData {
  settings: Settings
  history: Move[]
}

function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

function load(): { settings: Settings; state: GameState; started: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw) as Partial<SavedData>
      const settings = { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) }
      if (data.history) {
        const state = stateFromHistory(data.history)
        return { settings, state, started: state.status === 'playing' }
      }
    }
  } catch {
    /* ignore corrupt storage */
  }
  return { settings: { ...DEFAULT_SETTINGS }, state: initialState(), started: false }
}

export interface UseGame {
  state: GameState
  settings: Settings
  started: boolean
  thinking: boolean
  paused: boolean
  muted: boolean
  humanColor: Player
  canUndo: boolean
  newGame: (s: Settings) => void
  playMove: (move: Move) => void
  undo: () => void
  goMenu: () => void
  toggleMuted: () => void
}

export function useGame(): UseGame {
  const initial = load()
  const [state, setState] = useState<GameState>(initial.state)
  const [settings, setSettings] = useState<Settings>(initial.settings)
  const [started, setStarted] = useState<boolean>(initial.started)
  const [thinking, setThinking] = useState(false)
  // After an undo the game freezes: the AI will not move again until the human makes a fresh
  // decision (playMove clears this). Lets you step back several moves and only resume on your
  // next move, rather than the computer replying the instant you undo.
  const [paused, setPaused] = useState(false)
  const [muted, setMutedState] = useState<boolean>(loadMuted)

  const pastRef = useRef<GameState[]>([])
  const reqIdRef = useRef(0)
  const reqStartRef = useRef(0)
  const prevLenRef = useRef<number>(initial.state.history.length)

  // Keep the audio module in sync with the mute toggle.
  useEffect(() => {
    setMuted(muted)
  }, [muted])

  // Sound cue whenever a move is added to the history (covers both human and AI moves).
  useEffect(() => {
    const len = state.history.length
    if (len > prevLenRef.current) {
      const last = state.history[len - 1]
      if (last.type === 'pawn') playMoveSound()
      else playWallSound()
    }
    prevLenRef.current = len
  }, [state.history])

  // Receive AI moves.
  useEffect(() => {
    worker.onmessage = (e: MessageEvent<{ id: number; move?: Move; error?: string }>) => {
      const { id, move } = e.data
      if (id !== reqIdRef.current) return // stale response from an older request
      // Hold the move briefly so the opponent always appears to think for at least a moment.
      const remaining = Math.max(0, MIN_AI_THINK_MS - (performance.now() - reqStartRef.current))
      window.setTimeout(() => {
        if (id !== reqIdRef.current) return // superseded (new game / menu) during the wait
        reqIdRef.current = 0
        setThinking(false)
        if (move) {
          setState((prev) => {
            pastRef.current.push(prev)
            return applyMove(prev, move)
          })
        }
      }, remaining)
    }
    return () => {
      worker.onmessage = null
    }
  }, [])

  // Request an AI move whenever it is the AI's turn (skipped while paused after an undo).
  useEffect(() => {
    if (!started || settings.mode !== 'ai') return
    if (state.status !== 'playing') return
    if (paused) return
    if (state.turn !== settings.aiSide) return
    if (thinking || reqIdRef.current !== 0) return
    const id = ++reqIdRef.current
    setThinking(true)
    reqStartRef.current = performance.now()
    worker.postMessage({ state, level: settings.difficulty, id })
  }, [state, settings, started, thinking, paused])

  // Persist game.
  useEffect(() => {
    if (!started) return
    const data: SavedData = { settings, history: state.history }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      /* storage might be unavailable; ignore */
    }
  }, [settings, state, started])

  // Persist mute.
  useEffect(() => {
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [muted])

  const newGame = useCallback((s: Settings) => {
    pastRef.current = []
    reqIdRef.current = 0
    setThinking(false)
    setPaused(false)
    setSettings(s)
    setState(initialState())
    setStarted(true)
  }, [])

  const playMove = useCallback(
    (move: Move) => {
      setState((prev) => {
        if (prev.status !== 'playing') return prev
        const isHumanTurn = settings.mode === 'hotseat' || prev.turn !== settings.aiSide
        if (!isHumanTurn) return prev
        pastRef.current.push(prev)
        return applyMove(prev, move)
      })
      setPaused(false) // a fresh human decision ends any undo-pause and resumes play
    },
    [settings],
  )

  const undo = useCallback(() => {
    // If the AI is mid-thought, abandon that request: bumping the id makes its (eventual) reply
    // count as stale and get ignored. The game then stays frozen until the human plays again.
    if (reqIdRef.current !== 0) {
      reqIdRef.current = 0
      setThinking(false)
    }
    const past = pastRef.current
    // In AI mode, always hand the move back to the human: pop just our own last move when it is
    // currently the AI's turn (we interrupted its reply), otherwise pop its reply plus our move.
    const n = settings.mode === 'ai' ? (state.turn === settings.aiSide ? 1 : 2) : 1
    if (past.length < n) return
    pastRef.current = past.slice(0, past.length - n)
    setState(past[past.length - n])
    setPaused(true)
  }, [settings, state])

  const goMenu = useCallback(() => {
    setStarted(false)
    setThinking(false)
    setPaused(false)
    reqIdRef.current = 0
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }, [])

  const toggleMuted = useCallback(() => setMutedState((m) => !m), [])

  const humanColor: Player = settings.mode === 'ai' ? opponent(settings.aiSide) : state.turn
  // Undo is allowed whenever there's a move to take back — even while the AI is "thinking",
  // since undoing cancels the pending reply. The depth threshold mirrors undo's pop count so
  // the button disables exactly when there's nothing left to step back to.
  const undoDepth = settings.mode === 'ai' ? (state.turn === settings.aiSide ? 1 : 2) : 1
  const canUndo = pastRef.current.length >= undoDepth

  return {
    state,
    settings,
    started,
    thinking,
    paused,
    muted,
    humanColor,
    canUndo,
    newGame,
    playMove,
    undo,
    goMenu,
    toggleMuted,
  }
}
