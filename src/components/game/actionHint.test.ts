import { describe, expect, it } from 'vitest'
import { DEFAULT_MODULE_ID } from '@/game/content/modules'
import { actionHint } from './actionHint'

const base = { moduleId: DEFAULT_MODULE_ID, heroName: 'Wren Ashby', myTurn: false, hasActed: false }

describe('actionHint', () => {
  it('starts the hand-written adventure with its own suggestion', () => {
    expect(actionHint(base)).toBe('I ask the miller when he last saw Elsie…')
  })

  it('never mentions the miller in an AI-written adventure', () => {
    expect(actionHint({ ...base, moduleId: 'generated' })).toBe('Look around, talk to someone, or try something bold…')
  })

  it('switches to a general reminder once the player has acted', () => {
    expect(actionHint({ ...base, hasActed: true })).toBe('Speak, search, sneak, cast: anything Wren would try…')
    expect(actionHint({ ...base, moduleId: 'generated', hasActed: true })).toContain('anything Wren would try')
  })

  it('uses the hero’s own attack and a real foe on their combat turn', () => {
    expect(actionHint({ ...base, myTurn: true, hasActed: true, attackName: 'Fire Bolt', foeName: 'Wolf A' })).toBe('I target Wolf A with my Fire Bolt…')
  })

  it('falls back to a generic combat hint without an attack or foe', () => {
    expect(actionHint({ ...base, myTurn: true, attackName: 'Shortbow' })).toBe('Attack, cast, shove, or help an ally…')
  })
})
