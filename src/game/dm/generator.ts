/**
 * AI adventure writer (background job). The host picks a tone and setting
 * from fixed lists; the model writes a 4-scene module in the SAME shape as
 * the hand-written one. Output is validated with zod against the real
 * monster list and scene types; anything invalid falls back to the
 * hand-written module, so a table is never left without an adventure.
 */

import { streamDeepSpaceAgent } from 'deepspace/worker'
import type { JobContext } from 'deepspace/worker'
import { z } from 'zod'
import type { Env } from '../../../worker'
import { appRoomId, roomTools, tableRoomId } from '../../server/rooms'
import { MONSTERS } from '../content/monsters'
import { BELL_BENEATH_THE_MARSH } from '../content/modules'
import { ADVENTURE_ROW } from '../engine'
import type { AdventureData, AdventureModule, AdventureRequest, TableData } from '../types'
import { DM_MODEL_ID } from './run'

export interface WriteAdventurePayload {
  tableId: string
  request: AdventureRequest
}

const slug = z
  .string()
  .min(2)
  .max(40)
  .transform((s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
const monsterIds = Object.keys(MONSTERS) as [string, ...string[]]

const moduleSchema = z.object({
  title: z.string().min(3).max(70),
  pitch: z.string().min(20).max(300),
  tone: z.string().min(5).max(200),
  premise: z.string().min(40).max(1200),
  opening: z.string().min(20).max(600),
  scenes: z
    .array(
      z.object({
        id: slug,
        title: z.string().min(2).max(60),
        type: z.enum(['tavern', 'marsh', 'ruins', 'crypt']),
        goal: z.string().min(5).max(300),
        description: z.string().min(10).max(500),
        beats: z.array(z.string().max(300)).min(2).max(6),
        npcs: z.array(z.object({ name: z.string().max(40), role: z.string().max(120), secret: z.string().max(240).optional() })).max(4),
        hazards: z.array(z.string().max(120)).max(4),
        encounters: z
          .array(
            z.object({
              id: slug,
              label: z.string().max(80),
              groups: z
                .array(
                  z.object({
                    monsterId: z.enum(monsterIds),
                    base: z.number().int().min(1).max(3),
                    perExtraPlayer: z.number().min(0).max(1),
                    name: z.string().max(40).optional(),
                  }),
                )
                .min(1)
                .max(3),
            }),
          )
          .max(2),
        exits: z.string().max(240),
        minutes: z.number().int().min(3).max(10),
      }),
    )
    .length(4),
  victory: z.string().min(10).max(500),
  defeat: z.string().min(10).max(500),
})

function examplePayload() {
  const { id: _id, targetMinutes: _t, ...rest } = BELL_BENEATH_THE_MARSH
  return JSON.stringify(rest)
}

function writerPrompt(req: AdventureRequest): string {
  const monsters = Object.values(MONSTERS)
    .map((m) => `${m.id} (${m.name}, HP ${m.hp}, AC ${m.ac})`)
    .join('; ')
  return `Write an ORIGINAL short tabletop adventure for 1-5 level-3 characters, playable in about 25 minutes.
Tone: ${req.tone}. Setting: ${req.setting}.

Hard requirements:
- Exactly 4 scenes: a social/investigation opener, a journey or hazard, an exploration/puzzle, and a final confrontation with a named villain.
- Each scene "type" must be one of: tavern (any inn, hall or warm interior), marsh (any wilderness or road), ruins (ruined or abandoned buildings outdoors), crypt (any underground or dark interior).
- Encounters may only use these monsterIds: ${monsters}. Use 0-1 encounters in scenes 1-3 and exactly 1 in scene 4. The villain is a group with base 1, perExtraPlayer 0 and a "name".
- Give the party clear non-violent options too. Include a secret premise the DM reveals through play.
- Original names and places only: no existing franchise, characters or brands. PG-13.

Here is an example of the exact JSON shape (a different adventure — do not copy its plot):
${examplePayload()}

Reply with ONLY the JSON object for the new adventure, no code fence, no commentary.`
}

function parseModule(text: string): AdventureModule {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('no JSON object in reply')
  const parsed = moduleSchema.parse(JSON.parse(match[0]))
  // Ensure unique scene / encounter ids after slugging.
  const seen = new Set<string>()
  for (const s of parsed.scenes) {
    while (seen.has(s.id)) s.id = `${s.id}-x`
    seen.add(s.id)
    for (const e of s.encounters) {
      while (seen.has(e.id)) e.id = `${e.id}-x`
      seen.add(e.id)
    }
  }
  return { id: 'generated', targetMinutes: 25, ...parsed }
}

export async function runWriteAdventure(env: Env, payload: WriteAdventurePayload, ctx: JobContext): Promise<unknown> {
  const tools = roomTools(env, tableRoomId(payload.tableId))
  const row = await tools.get<AdventureData>('adventure', ADVENTURE_ROW)
  if (!row || row.data.status !== 'writing') return { skipped: 'not writing' }

  let module: AdventureModule | null = null
  let error = ''
  for (let attempt = 1; attempt <= 2 && !module; attempt++) {
    try {
      ctx.progress(attempt === 1 ? 0.2 : 0.6, attempt === 1 ? 'writing' : 'rewriting')
      const { result } = streamDeepSpaceAgent(env, {
        profile: 'application',
        modelId: DM_MODEL_ID,
        effort: 'medium',
        maxOutputTokens: 6000,
        instructions: 'You are an award-winning tabletop adventure designer. You reply with strict JSON only.',
        messages: [{ role: 'user', content: writerPrompt(payload.request) + (error ? `\n\nYour previous attempt was invalid (${error.slice(0, 300)}). Fix it.` : '') }],
        abortSignal: AbortSignal.any([ctx.signal, AbortSignal.timeout(120_000)]),
      })
      module = parseModule(await result.text)
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
      console.warn(`[adventure] attempt ${attempt} failed table=${payload.tableId}: ${error.slice(0, 300)}`)
    }
  }

  const final = module ?? BELL_BENEATH_THE_MARSH
  await tools.update<AdventureData>('adventure', ADVENTURE_ROW, {
    status: 'ready',
    source: module ? 'generated' : 'fallback',
    module: final,
    error: module ? '' : 'The AI-written adventure did not come out right, so this table will play The Bell Beneath the Marsh.',
  })
  await tools.update('game', 'state', { sceneId: final.scenes[0].id })
  await roomTools(env, appRoomId(env)).update<TableData>('tables', payload.tableId, { moduleTitle: final.title })
  return { ok: true, generated: !!module }
}
