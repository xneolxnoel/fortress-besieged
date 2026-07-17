import { GameScreen } from './components/GameScreen'
import { StartMenu } from './components/StartMenu'
import { useGame } from './hooks/useGame'

export function App() {
  const game = useGame()
  if (!game.started) {
    return (
      <div className="app">
        <StartMenu initial={game.settings} onStart={game.newGame} />
      </div>
    )
  }
  return (
    <div className="app">
      <GameScreen game={game} />
    </div>
  )
}
