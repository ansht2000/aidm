/**
 * Deterministic stand-in for the model, used only by local dev/test tables
 * created with `fakeDm` (and only when ALLOW_DEBUG_ROUTES === 'true', which
 * production never sets). Exercises the same tools and writer as the real DM.
 */

import type { DmReason, TableSnapshot } from '../engine'
import type { Recap } from '../types'
import { impl, type ToolContext } from './tools'

async function say(ctx: ToolContext, text: string) {
  for (const word of text.split(/(?<= )/)) await ctx.writer.text(word)
  await ctx.writer.closeSegment()
}

export async function runFakeTurn(ctx: ToolContext, reason: DmReason) {
  const living = ctx.snap.characters.filter((c) => c.data.hp > 0)
  const first = living[0]
  if (reason === 'opening') {
    await say(ctx, 'Fog presses against the tavern shutters as the bell tolls once, far out on the marsh. What do you do?')
    return
  }
  if (reason === 'round' && ctx.snap.game.round === 1 && first) {
    await say(ctx, 'The miller grabs your sleeve, desperate.')
    await impl.request_rolls(ctx, { rolls: [{ characterId: first.recordId, kind: 'skill', key: 'insight', dc: 10, reason: 'Read the miller' }] })
    await say(ctx, `${first.data.name}, roll Insight.`)
    return
  }
  if (reason === 'rolls') {
    await say(ctx, 'You learn the bell calls to the grieving. The causeway east leads to the drowned chapel. What next?')
    return
  }
  if (reason === 'round' || reason === 'finale' || reason === 'combat') {
    await impl.end_adventure(ctx, { outcome: 'victory' })
    await say(ctx, 'The bell falls silent at last, and the fog lifts over Saltmere at dawn.')
  }
}

export function fakeRecap(snap: TableSnapshot, outcome: string): Recap {
  return {
    title: 'The Bell Falls Silent',
    summary: 'A test chronicle: the party answered the bell and brought the lost home.',
    outcome: outcome === 'defeat' ? 'defeat' : 'victory',
    highlights: snap.characters.slice(0, 2).map((c) => ({ characterId: c.recordId, name: c.data.name, moment: `${c.data.name} kept their nerve.` })),
  }
}
