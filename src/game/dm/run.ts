/**
 * Runs one DM turn or the end-of-session recap inside the table's JobRoom.
 *
 * The model is Claude Opus 5.5 through DeepSpace's agent runner
 * (`streamDeepSpaceAgent`): owner-billed (no user token), low effort for
 * table-speed latency, a bounded tool loop, and an abort deadline.
 */

import { streamDeepSpaceAgent } from 'deepspace/worker'
import type { JobContext } from 'deepspace/worker'
import type { Env } from '../../../worker'
import { appRoomId, roomTools } from '../../server/rooms'
import { addLog, afterDmTurn, loadTable, patchGame, type DmJobPayload, type TableSnapshot } from '../engine'
import type { LogData, Recap, RollData, TableData } from '../types'
import { runFakeTurn, fakeRecap } from './fake'
import { recapPrompt, systemPrompt, turnMessage } from './prompt'
import { buildAiTools, type ToolContext } from './tools'
import { NarrationWriter } from './writer'

export const DM_MODEL_ID = 'claude-opus-5-5'
const TURN_TIMEOUT_MS = 90_000

async function loadHistory(snap: TableSnapshot) {
  const [log, rolls] = await Promise.all([
    snap.tools.query<LogData>('log', { orderBy: 'seq', orderDir: 'asc', limit: 400 }),
    snap.tools.query<RollData>('rolls', { orderBy: 'seq', orderDir: 'asc', limit: 200 }),
  ])
  return { log, rolls }
}

/** Is this job still the one the table is waiting for? */
function isCurrent(snap: TableSnapshot, payload: DmJobPayload) {
  return snap.game.turnSeq === payload.seq && snap.game.dmStatus === 'queued'
}

export async function runDmTurn(env: Env, payload: DmJobPayload, ctx: JobContext): Promise<unknown> {
  const snap = await loadTable(env, payload.tableId)
  if (!snap || !isCurrent(snap, payload)) return { skipped: 'stale' }

  await patchGame(snap.tools, { dmStatus: 'thinking' })
  const writer = new NarrationWriter(snap.tools, snap.game.round)
  const toolCtx: ToolContext = { snap, writer, endRequested: null, rollsRequested: false }
  const started = Date.now()

  try {
    if (snap.game.fakeDm && env.ALLOW_DEBUG_ROUTES === 'true') {
      await runFakeTurn(toolCtx, payload.reason)
    } else {
      const { log, rolls } = await loadHistory(snap)
      const signal = AbortSignal.any([ctx.signal, AbortSignal.timeout(TURN_TIMEOUT_MS)])
      const { result } = streamDeepSpaceAgent(env, {
        profile: 'application',
        modelId: DM_MODEL_ID,
        effort: 'low',
        maxToolCalls: 14,
        maxOutputTokens: 4000,
        instructions: systemPrompt(snap.game.moduleId),
        messages: [{ role: 'user', content: turnMessage({ snap, reason: payload.reason, log, rolls }) }],
        tools: buildAiTools(toolCtx),
        abortSignal: signal,
      })
      let narrating = false
      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') {
          if (!narrating) {
            narrating = true
            void patchGame(snap.tools, { dmStatus: 'narrating' })
          }
          await writer.text(part.text)
        } else if (part.type === 'error') {
          throw part.error instanceof Error ? part.error : new Error(String(part.error))
        }
      }
    }
    await writer.drain()
  } catch (err) {
    await writer.drain().catch(() => undefined)
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[dm] turn failed table=${payload.tableId} reason=${payload.reason}: ${message}`)
    await patchGame(snap.tools, { dmStatus: 'error', dmError: message.slice(0, 200) })
    await addLog(snap.tools, {
      kind: 'system',
      text: 'The Dungeon Master loses their train of thought. The host can ask them to try again.',
      round: snap.game.round,
      data: { type: 'dm-error' },
    })
    return { error: message }
  }

  await patchGame(snap.tools, { turnsUsed: snap.game.turnsUsed + 1, dmStatus: 'idle' })
  console.info(`[dm] turn ok table=${payload.tableId} reason=${payload.reason} ms=${Date.now() - started}`)

  const endRequested = toolCtx.endRequested ?? (payload.reason === 'finale' ? 'victory' : null)
  await afterDmTurn(env, payload.tableId, { endRequested })
  return { ok: true, ms: Date.now() - started }
}

function parseRecap(text: string, snap: TableSnapshot, outcome: string): Recap {
  const fallback: Recap = {
    title: 'An Unwritten Night',
    summary: text.trim().slice(0, 1200) || 'The tale of this night was not recorded.',
    outcome: outcome === 'victory' || outcome === 'defeat' ? outcome : 'unfinished',
    highlights: [],
  }
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return fallback
  try {
    const raw = JSON.parse(match[0]) as Partial<Recap>
    const ids = new Set(snap.characters.map((c) => c.recordId))
    return {
      title: String(raw.title ?? fallback.title).slice(0, 80),
      summary: String(raw.summary ?? fallback.summary).slice(0, 1500),
      outcome: fallback.outcome,
      highlights: (Array.isArray(raw.highlights) ? raw.highlights : [])
        .filter((h) => h && ids.has(String(h.characterId)))
        .slice(0, 5)
        .map((h) => ({
          characterId: String(h.characterId),
          name: snap.characters.find((c) => c.recordId === h.characterId)?.data.name ?? '',
          moment: String(h.moment ?? '').slice(0, 240),
        })),
    }
  } catch {
    return fallback
  }
}

export async function runRecap(env: Env, payload: DmJobPayload, ctx: JobContext): Promise<unknown> {
  const snap = await loadTable(env, payload.tableId)
  if (!snap || !isCurrent(snap, payload)) return { skipped: 'stale' }
  await patchGame(snap.tools, { dmStatus: 'thinking' })
  const outcome = snap.game.outcome || 'unfinished'

  let recap: Recap
  try {
    if (snap.game.fakeDm && env.ALLOW_DEBUG_ROUTES === 'true') {
      recap = fakeRecap(snap, outcome)
    } else {
      const { log, rolls } = await loadHistory(snap)
      const { result } = streamDeepSpaceAgent(env, {
        profile: 'application',
        modelId: DM_MODEL_ID,
        effort: 'low',
        maxOutputTokens: 2000,
        instructions: 'You are the chronicler of a tabletop roleplaying session. You write warm, specific, accurate recaps.',
        messages: [{ role: 'user', content: recapPrompt(snap, log, rolls, outcome) }],
        abortSignal: AbortSignal.any([ctx.signal, AbortSignal.timeout(TURN_TIMEOUT_MS)]),
      })
      recap = parseRecap(await result.text, snap, outcome)
    }
  } catch (err) {
    console.error(`[dm] recap failed table=${payload.tableId}: ${err instanceof Error ? err.message : String(err)}`)
    recap = { title: 'The Night Ends', summary: 'The chronicler could not finish the tale, but the party will remember.', outcome: outcome as Recap['outcome'], highlights: [] }
  }

  await addLog(snap.tools, { kind: 'recap', text: recap.summary, round: snap.game.round, data: recap as unknown as Record<string, unknown> })
  await patchGame(snap.tools, { phase: 'ended', dmStatus: 'idle', deadlineAt: 0 })

  // Mirror onto the lobby index so "Past adventures" can show it.
  const tableId = payload.tableId
  const app = roomTools(env, appRoomId(env))
  await app.update<TableData>('tables', tableId, {
    status: 'ended',
    recap: { title: recap.title, summary: recap.summary, outcome: recap.outcome },
  })
  return { ok: true }
}
