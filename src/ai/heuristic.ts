// Position evaluation, from the perspective of the player to move (negamax convention).
// The dominant feature is the difference in shortest-path-to-goal lengths; a small wall-count
// advantage and a goal-edge reachability term refine it without ever overriding the path.

import { opponent, playerPathInfo } from '../engine'
import { type GameState } from '../engine'

/** Large sentinel for terminal (won/lost) positions; must exceed any static eval magnitude. */
export const MATE = 100000

const WALL_WEIGHT = 2 // walls are the race-deciding resource: a well-placed one extends the
//   opponent's path by ~2 steps, and the player who keeps walls for the endgame wins close races.
//   Undervaluing it made the bot squander all its walls early (on walls the opponent simply went
//   around), then end up wall-less and doomed — ahead in raw distance but losing once the
//   opponent's retained walls are counted. 2.0 makes a wall deficit read as "behind".
const REACH_WEIGHT = 0.15 // per reachable-goal-cell advantage — a robustness tie-breaker
// Near-goal "threat": being close to your own goal is good; the opponent being close to theirs is
// an emergency. This is shaped (1/(d+1)) so a one-step difference right at the goal edge matters
// far more than one in the middle of the board. Without it a linear path-diff eval ties "walk and
// let the opponent advance" with "wall and hold them" at a shallow horizon — so the bot would
// sometimes walk into a loss it could feel coming if the eval were threat-aware.
const THREAT_WEIGHT = 3

export function evaluate(state: GameState): number {
  const me = state.turn
  const opp = opponent(me)
  const mine = playerPathInfo(me, state.positions[me], state.walls)
  const theirs = playerPathInfo(opp, state.positions[opp], state.walls)

  // Enclosure can't arise in legal play, but guard anyway.
  if (!Number.isFinite(mine.distance)) return -MATE
  if (!Number.isFinite(theirs.distance)) return MATE

  const pathScore = theirs.distance - mine.distance
  // Walls are a finite, late-deciding resource; keeping more than your opponent is worth ~2 race
  // steps each. The weight stays constant so the bot is never deterred from spending a wall on a
  // crucial block (the path/threat gain of a real block always exceeds 2).
  const wallScore = WALL_WEIGHT * (state.wallsLeft[me] - state.wallsLeft[opp])
  // Robustness: the more of your goal edge you can still reach, the harder you are to wall off.
  const reachScore = REACH_WEIGHT * (mine.goalReach - theirs.goalReach)
  // Threat: closeness to the goal edge counts disproportionately (1/(d+1) is steep near d=0).
  const threatScore = THREAT_WEIGHT * (1 / (mine.distance + 1) - 1 / (theirs.distance + 1))

  return pathScore + wallScore + reachScore + threatScore
}
