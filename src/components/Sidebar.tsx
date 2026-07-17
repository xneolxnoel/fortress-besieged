import { useState } from 'react'
import {
  formatMoveHistory,
  moveToNotation,
  opponent,
  playerLabel,
  START_WALLS,
  type GameState,
  type Move,
  type Player,
} from '../engine'
import type { Settings } from '../types'
import { DIFFICULTY_LABELS } from '../types'

interface SidebarProps {
  state: GameState
  settings: Settings
  thinking: boolean
  canUndo: boolean
  onUndo: () => void
  onNewGame: () => void
  onMenu: () => void
}

function role(color: Player, settings: Settings): string {
  if (settings.mode === 'hotseat') return 'Human'
  return color === settings.aiSide ? `AI · ${DIFFICULTY_LABELS[settings.difficulty]}` : 'You'
}

/** A shareable plain-text record of the game: result, mode, then the numbered move list. */
function buildRecord(state: GameState, settings: Settings): string {
  const result =
    state.status === 'white-wins'
      ? 'White wins'
      : state.status === 'black-wins'
        ? 'Black wins'
        : '(game in progress)'
  const mode =
    settings.mode === 'ai'
      ? `vs Computer · ${DIFFICULTY_LABELS[settings.difficulty]} · you are ${playerLabel(opponent(settings.aiSide))}`
      : 'Hot-seat'
  return `Fortress Besieged game record\nResult: ${result}\nMode: ${mode}\n\n${formatMoveHistory(state.history)}`
}

export function Sidebar({
  state,
  settings,
  thinking,
  canUndo,
  onUndo,
  onNewGame,
  onMenu,
}: SidebarProps) {
  const winner = state.status === 'white-wins' ? 'white' : state.status === 'black-wins' ? 'black' : null
  const [copied, setCopied] = useState(false)

  const onCopyRecord = async () => {
    try {
      await navigator.clipboard.writeText(buildRecord(state, settings))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard may be unavailable (permissions / non-secure context) — ignore */
    }
  }

  const onDownloadRecord = () => {
    const blob = new Blob([buildRecord(state, settings)], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `fortress-besieged-game-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <aside className="sidebar">
      <PlayerCard
        color="black"
        state={state}
        active={state.turn === 'black' && state.status === 'playing'}
        thinking={thinking && state.turn === 'black'}
        settings={settings}
      />
      <PlayerCard
        color="white"
        state={state}
        active={state.turn === 'white' && state.status === 'playing'}
        thinking={thinking && state.turn === 'white'}
        settings={settings}
      />

      {winner && (
        <div className={`banner banner-${winner}`}>
          {playerLabel(winner)} wins!
          {settings.mode === 'ai' && (
            <span className="banner-sub">
              {winner === settings.aiSide ? 'The computer beat you.' : 'You beat the computer!'}
            </span>
          )}
          <div className="banner-actions">
            <button type="button" onClick={onCopyRecord}>
              {copied ? 'Copied!' : 'Copy record'}
            </button>
            <button type="button" onClick={onDownloadRecord}>
              Download .txt
            </button>
          </div>
        </div>
      )}

      <MoveList history={state.history} />

      <div className="controls">
        <button type="button" onClick={onUndo} disabled={!canUndo}>
          ↶ Undo
        </button>
        <button type="button" onClick={onNewGame}>
          New game
        </button>
        <button type="button" className="ghost" onClick={onMenu}>
          Menu
        </button>
      </div>
    </aside>
  )
}

function PlayerCard({
  color,
  state,
  active,
  thinking,
  settings,
}: {
  color: Player
  state: GameState
  active: boolean
  thinking: boolean
  settings: Settings
}) {
  const left = state.wallsLeft[color]
  const used = START_WALLS - left
  return (
    <div className={`player-card card-${color} ${active ? 'active' : ''}`}>
      <div className="player-head">
        <span className={`chip chip-${color}`} />
        <span className="player-name">{playerLabel(color)}</span>
        <span className="player-role">{role(color, settings)}</span>
      </div>
      <div className="walls-row">
        <span className="walls-label">Walls</span>
        <span className="pips">
          {Array.from({ length: START_WALLS }).map((_, i) => (
            <span key={i} className={`pip ${i < left ? 'pip-on' : 'pip-off'}`} />
          ))}
        </span>
        <span className="walls-count">
          {left}/{START_WALLS}
        </span>
      </div>
      {thinking && <div className="thinking">thinking…</div>}
      {active && !thinking && <div className="turn-tag">to move</div>}
      <div className="used">placed {used}</div>
    </div>
  )
}

function MoveList({ history }: { history: Move[] }) {
  // Pair moves into full-board rows (white then black).
  const rows: Array<{ n: number; white?: Move; black?: Move }> = []
  for (let i = 0; i < history.length; i += 2) {
    rows.push({ n: i / 2 + 1, white: history[i], black: history[i + 1] })
  }
  return (
    <div className="movelist">
      <div className="movelist-head">Moves</div>
      <div className="movelist-body">
        {rows.length === 0 && <div className="muted small">No moves yet.</div>}
        {rows.map((r) => (
          <div key={r.n} className="move-row">
            <span className="move-num">{r.n}.</span>
            <span className="move-cell white">{r.white ? moveToNotation(r.white) : ''}</span>
            <span className="move-cell black">{r.black ? moveToNotation(r.black) : ''}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
