/// <reference lib="webworker" />
// Web Worker entry: receives a game state + difficulty, returns the chosen move.
// Running the search off the main thread keeps the UI responsive while the AI "thinks".

import { chooseMove, type AiRequest, type AiResponse } from './ai'

const ctx = self as unknown as DedicatedWorkerGlobalScope

ctx.onmessage = (e: MessageEvent<AiRequest>) => {
  const { state, level, id } = e.data
  try {
    const move = chooseMove(state, level)
    const response: AiResponse = { id, move }
    ctx.postMessage(response)
  } catch (err) {
    const response: AiResponse = { id, error: err instanceof Error ? err.message : String(err) }
    ctx.postMessage(response)
  }
}
