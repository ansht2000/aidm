/**
 * Placeholder text for the action box. It changes with the situation, so
 * it never names a character or monster that isn't in this game:
 * - combat turn: the hero's first attack aimed at a foe still standing;
 * - before the player's first action: a concrete starter (the hand-written
 *   module gets its own; AI-written ones get a generic one);
 * - afterwards: a reminder of the range of things a hero can try.
 */

import { DEFAULT_MODULE_ID } from '@/game/content/modules'

export interface HintInput {
  moduleId: string
  heroName: string
  myTurn: boolean
  hasActed: boolean
  attackName?: string
  foeName?: string
}

export function actionHint({ moduleId, heroName, myTurn, hasActed, attackName, foeName }: HintInput): string {
  if (myTurn) {
    if (attackName && foeName) return `I target ${foeName} with my ${attackName}…`
    return 'Attack, cast, shove, or help an ally…'
  }
  if (!hasActed) {
    return moduleId === DEFAULT_MODULE_ID ? 'I ask the miller when he last saw Elsie…' : 'Look around, talk to someone, or try something bold…'
  }
  const first = heroName.trim().split(/\s+/)[0] || 'your hero'
  return `Speak, search, sneak, cast: anything ${first} would try…`
}
