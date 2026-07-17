import { useState } from 'react'
import { opponent, type Player } from '../engine'
import type { Difficulty, Settings } from '../types'
import { DIFFICULTY_LABELS } from '../types'

interface StartMenuProps {
  initial: Settings
  onStart: (s: Settings) => void
}

const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard']

export function StartMenu({ initial, onStart }: StartMenuProps) {
  const [mode, setMode] = useState<Settings['mode']>(initial.mode)
  const [difficulty, setDifficulty] = useState<Difficulty>(initial.difficulty)
  const [humanSide, setHumanSide] = useState<Player>(opponent(initial.aiSide))

  const start = () => {
    const settings: Settings =
      mode === 'ai'
        ? { mode, difficulty, aiSide: opponent(humanSide) }
        : { mode, difficulty, aiSide: 'black' }
    onStart(settings)
  }

  return (
    <div className="menu">
      <header className="menu-head">
        <h1 className="title">Fortress Besieged</h1>
        <p className="subtitle">Race your pawn to the far edge, wall by wall.</p>
      </header>

      <section className="menu-block">
        <h2>1 · Mode</h2>
        <div className="choice-row">
          <Choice on={mode === 'hotseat'} onClick={() => setMode('hotseat')} title="Two players" />
          <Choice on={mode === 'ai'} onClick={() => setMode('ai')} title="Play the computer" />
        </div>
      </section>

      {mode === 'ai' && (
        <>
          <section className="menu-block">
            <h2>2 · Difficulty</h2>
            <div className="choice-row three">
              {DIFFICULTIES.map((d) => (
                <Choice
                  key={d}
                  on={difficulty === d}
                  onClick={() => setDifficulty(d)}
                  title={DIFFICULTY_LABELS[d]}
                />
              ))}
            </div>
          </section>

          <section className="menu-block">
            <h2>3 · Your colour</h2>
            <div className="choice-row">
              <Choice on={humanSide === 'white'} onClick={() => setHumanSide('white')} title="White" />
              <Choice on={humanSide === 'black'} onClick={() => setHumanSide('black')} title="Black" />
            </div>
          </section>
        </>
      )}

      <button type="button" className="start-btn" onClick={start}>
        Start game →
      </button>
    </div>
  )
}

function Choice({
  on,
  onClick,
  title,
  sub,
}: {
  on: boolean
  onClick: () => void
  title: string
  sub?: string
}) {
  return (
    <button type="button" className={`choice ${on ? 'on' : ''}`} onClick={onClick} aria-pressed={on}>
      <span className="choice-title">{title}</span>
      {sub && <span className="choice-sub">{sub}</span>}
    </button>
  )
}
