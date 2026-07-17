import { Board } from './Board'
import { Sidebar } from './Sidebar'
import { playerLabel, type GameState, type Player } from '../engine'
import type { UseGame } from '../hooks/useGame'

export function GameScreen({ game }: { game: UseGame }) {
  const { state, settings, thinking, paused, muted, canUndo, playMove, undo, newGame, goMenu, toggleMuted } =
    game

  const interactive =
    state.status === 'playing' &&
    !thinking &&
    (settings.mode === 'hotseat' || state.turn !== settings.aiSide)

  const headline = headlineFor(state, settings, thinking, paused)

  return (
    <div className={`game ${paused ? 'is-paused' : ''}`}>
      <header className="game-head">
        <button type="button" className="ghost small" onClick={goMenu}>
          ‹ Menu
        </button>
        <div className={`turn-line turn-${state.turn}`}>
          <span className={`chip chip-${state.turn}`} />
          {headline}
        </div>
        <div className="head-right">
          <button
            type="button"
            className="ghost small icon-btn"
            onClick={toggleMuted}
            aria-pressed={muted}
            title={muted ? 'Sound off — click to enable' : 'Sound on — click to mute'}
          >
            {muted ? '🔇' : '🔊'}
          </button>
          <span className="mode-tag">{settings.mode === 'ai' ? 'vs Computer' : 'Hot-seat'}</span>
        </div>
      </header>

      {paused && state.status === 'playing' && (
        <div className="pause-banner">
          Paused — undo again, or make your move to resume.
        </div>
      )}

      <div className="play-area">
        <Board state={state} interactive={interactive} onMove={playMove} />
        <Sidebar
          state={state}
          settings={settings}
          thinking={thinking}
          canUndo={canUndo}
          onUndo={undo}
          onNewGame={() => newGame(settings)}
          onMenu={goMenu}
        />
      </div>
    </div>
  )
}

function headlineFor(
  state: GameState,
  settings: UseGame['settings'],
  thinking: boolean,
  paused: boolean,
): string {
  if (state.status === 'white-wins') return `${playerLabel('white')} wins`
  if (state.status === 'black-wins') return `${playerLabel('black')} wins`
  if (paused) return 'Paused'
  if (thinking) return 'Computer is thinking…'
  if (settings.mode === 'ai') {
    return state.turn === settings.aiSide ? "Computer's move" : 'Your move'
  }
  return `${playerLabel(state.turn as Player)} to move`
}
