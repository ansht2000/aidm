/**
 * Server actions for the game. Every player move goes through here.
 *
 * These run with RBAC OFF (see src/server/action-routes.ts), so each one
 * checks the caller's seat, host status, phase and turn itself before it
 * writes. Inputs are bounded; ids are validated; nothing trusts the client.
 */

import { enqueueJob } from 'deepspace/worker'
import type { ActionHandler, ActionResult } from 'deepspace/worker'
import type { Env } from '../../worker'
import { PREGEN_BY_ID, SIGILS } from '../game/content/pregens'
import { DEFAULT_MODULE_ID, MODULES } from '../game/content/modules'
import {
  ADVENTURE_ROW,
  GAME_ROW,
  addLog,
  currentCombatant,
  initialGame,
  loadTable,
  patchGame,
  queueDm,
  queueRecap,
  roundComplete,
  type TableSnapshot,
} from '../game/engine'
import { cryptoRng, resolveRoll } from '../game/rules'
import {
  ADVENTURE_SETTINGS,
  ADVENTURE_TONES,
  MAX_ACTION_CHARS,
  MAX_DM_TURNS,
  MAX_SEATS,
  type AdventureData,
  type AdventureRequest,
  type CharacterData,
  type GameData,
  type LogData,
  type RollData,
  type TableData,
} from '../game/types'
import { appRoomId, isValidTableId, newId, newInviteCode, roomTools, tableRoomId, type RecordData } from '../server/rooms'

type Handler = ActionHandler<Env>

class UserError extends Error {}

const ok = <T>(data: T): ActionResult => ({ success: true, data })
const err = (error: string, code?: string): ActionResult => ({ success: false, error, code })

/** Wrap a handler: user-facing errors become `{success:false}`, others are logged. */
function action(fn: (ctx: Parameters<Handler>[0]) => Promise<ActionResult>): Handler {
  return async (ctx) => {
    try {
      return await fn(ctx)
    } catch (e) {
      if (e instanceof UserError) return err(e.message)
      console.error(`[action] failed: ${e instanceof Error ? e.message : String(e)}`)
      return err('Something went wrong. Please try again.')
    }
  }
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

function requireTableId(params: Record<string, unknown>): string {
  const id = params.tableId
  if (!isValidTableId(id)) throw new UserError('Unknown table.')
  return id
}

async function getTable(env: Env, tableId: string): Promise<RecordData<TableData>> {
  const row = await roomTools(env, appRoomId(env)).get<TableData>('tables', tableId)
  if (!row) throw new UserError('That table no longer exists.')
  return row
}

async function requireSeat(env: Env, tableId: string, userId: string) {
  const table = await getTable(env, tableId)
  if (!table.data.playerIds.includes(userId)) throw new UserError('You are not seated at this table.')
  const snap = await loadTable(env, tableId)
  if (!snap) throw new UserError('This table is not ready yet.')
  return { table, snap }
}

function myCharacter(snap: TableSnapshot, userId: string) {
  return snap.characters.find((c) => c.data.userId === userId) ?? null
}

/**
 * Claim one of `max` daily slots for `kind`. Each slot is a row whose
 * (userId, day, kind, slot) tuple is unique in the Durable Object, so
 * concurrent requests cannot all pass the cap.
 */
async function claimQuota(env: Env, userId: string, kind: 'table' | 'adventure', max: number): Promise<boolean> {
  const app = roomTools(env, appRoomId(env))
  const day = new Date().toISOString().slice(0, 10)
  for (let slot = 0; slot < max; slot++) {
    try {
      await app.create('quota', { userId, day, kind, slot })
      return true
    } catch (e) {
      if (!/duplicate|exists/i.test(String(e))) throw e
    }
  }
  return false
}

async function displayName(env: Env, userId: string): Promise<string> {
  const row = await roomTools(env, appRoomId(env)).get<{ name?: string }>('users', userId)
  return str(row?.data.name ?? '', 40) || 'Adventurer'
}

// ---------------------------------------------------------------------------
// Lobby
// ---------------------------------------------------------------------------

export const createTable: Handler = action(async ({ userId, params, env }) => {
  const name = str(params.name, 60) || 'A table in the fog'
  const visibility = params.visibility === 'private' ? 'private' : 'public'
  const fakeDm = params.fakeDm === true && env.ALLOW_DEBUG_ROUTES === 'true'
  // Owner and local dev are exempt; tests pass enforceQuota to exercise the caps locally.
  const exempt = userId === env.OWNER_USER_ID || (env.ALLOW_DEBUG_ROUTES === 'true' && params.enforceQuota !== true)
  const app = roomTools(env, appRoomId(env))

  // AI-written adventure? Tone and setting come from fixed lists only.
  const gen = params.generate as Partial<AdventureRequest> | undefined
  const request: AdventureRequest | null =
    gen && (ADVENTURE_TONES as readonly string[]).includes(String(gen.tone)) && (ADVENTURE_SETTINGS as readonly string[]).includes(String(gen.setting))
      ? { tone: gen.tone as AdventureRequest['tone'], setting: gen.setting as AdventureRequest['setting'] }
      : null
  if (gen && !request) throw new UserError('Pick a tone and a setting for the new adventure.')

  // Cost caps (owner and local dev exempt): 3 tables and 2 AI-written
  // adventures per user per UTC day, claimed atomically.
  if (!exempt) {
    if (!(await claimQuota(env, userId, 'table', 3))) throw new UserError('You can host up to 3 tables a day. Join an open table instead!')
    if (request && !(await claimQuota(env, userId, 'adventure', 2))) {
      throw new UserError('You can have the DM write 2 new adventures a day. Try The Bell Beneath the Marsh!')
    }
  }

  const moduleId = request ? 'generated' : typeof params.moduleId === 'string' && MODULES[params.moduleId] ? params.moduleId : DEFAULT_MODULE_ID
  const base = MODULES[request ? DEFAULT_MODULE_ID : moduleId]
  const tableId = newId(16)
  let code = newInviteCode()
  const row: TableData = {
    code,
    name,
    hostId: userId,
    hostName: await displayName(env, userId),
    status: 'lobby',
    visibility,
    moduleId,
    moduleTitle: request ? 'A new adventure (being written)' : base.title,
    playerIds: [userId],
    seatsTaken: 1,
    recap: null,
  }
  for (let attempt = 0; ; attempt++) {
    try {
      await app.create<TableData>('tables', row, tableId)
      break
    } catch (e) {
      if (attempt >= 2 || !/duplicate/i.test(String(e))) throw e
      code = newInviteCode()
      row.code = code
    }
  }

  const tools = roomTools(env, tableRoomId(tableId))
  await tools.create<GameData>('game', initialGame(userId, moduleId, base.scenes[0].id, fakeDm), GAME_ROW)
  await tools.create<AdventureData>(
    'adventure',
    { status: request ? 'writing' : 'ready', source: 'handwritten', module: base, request, error: '' },
    ADVENTURE_ROW,
  )
  if (request) {
    await enqueueJob(env.JOB_ROOMS, tableRoomId(tableId), 'write-adventure', { tableId, request }, { maxAttempts: 1 })
  }
  return ok({ tableId, code })
})

export const joinTable: Handler = action(async ({ userId, params, env }) => {
  const code = str(params.code, 12).toUpperCase()
  if (!/^[A-Z0-9]{6}$/.test(code)) throw new UserError('Invite codes are 6 letters and numbers.')
  const app = roomTools(env, appRoomId(env))
  const [table] = await app.query<TableData>('tables', { where: { code }, limit: 1 })
  if (!table) throw new UserError('No table has that code.')
  const t = table.data
  if (t.playerIds.includes(userId)) return ok({ tableId: table.recordId, code })
  if (t.status !== 'lobby') throw new UserError('That session has already started.')
  if (t.playerIds.length >= MAX_SEATS) throw new UserError('That table is full.')
  const playerIds = [...t.playerIds, userId]
  await app.update<TableData>('tables', table.recordId, { playerIds, seatsTaken: playerIds.length })
  return ok({ tableId: table.recordId, code })
})

export const leaveTable: Handler = action(async ({ userId, params, env }) => {
  const tableId = requireTableId(params)
  const { table, snap } = await requireSeat(env, tableId, userId)
  if (snap.game.phase !== 'lobby') throw new UserError('You cannot leave once the session has started.')
  if (table.data.hostId === userId) throw new UserError('The host cannot leave. End the table instead.')
  const mine = myCharacter(snap, userId)
  if (mine) await snap.tools.remove('characters', mine.recordId)
  const playerIds = table.data.playerIds.filter((p) => p !== userId)
  await roomTools(env, appRoomId(env)).update<TableData>('tables', tableId, { playerIds, seatsTaken: playerIds.length })
  return ok({ left: true })
})

export const claimCharacter: Handler = action(async ({ userId, params, env }) => {
  const tableId = requireTableId(params)
  const { snap } = await requireSeat(env, tableId, userId)
  if (snap.game.phase !== 'lobby') throw new UserError('Characters are locked once the session starts.')
  const pregen = PREGEN_BY_ID[str(params.pregenId, 20)]
  if (!pregen) throw new UserError('Pick one of the heroes.')
  const taken = snap.characters.find((c) => c.data.pregenId === pregen.id && c.data.userId !== userId)
  if (taken) throw new UserError(`${taken.data.name} is already taken.`)

  const name = str(params.name, 40) || pregen.name
  const backstory = str(params.backstory, 240) || pregen.backstory
  const sigil = (SIGILS as readonly string[]).includes(String(params.sigil)) ? String(params.sigil) : pregen.sigil
  const existing = myCharacter(snap, userId)
  const data: CharacterData = {
    userId,
    pregenId: pregen.id,
    name,
    className: pregen.className,
    ancestry: pregen.ancestry,
    level: pregen.level,
    abilities: pregen.abilities,
    ac: pregen.ac,
    hp: pregen.maxHp,
    maxHp: pregen.maxHp,
    speed: pregen.speed,
    prof: pregen.prof,
    skills: pregen.proficiencies,
    attacks: pregen.attacks,
    features: pregen.features,
    inventory: pregen.inventory,
    conditions: [],
    backstory,
    sigil,
    tagline: pregen.tagline,
    ready: existing?.data.pregenId === pregen.id ? existing.data.ready : false,
  }
  if (existing) await snap.tools.update<CharacterData>('characters', existing.recordId, data)
  else await snap.tools.create<CharacterData>('characters', data, userId)
  return ok({ characterId: existing?.recordId ?? userId })
})

export const setReady: Handler = action(async ({ userId, params, env }) => {
  const tableId = requireTableId(params)
  const { snap } = await requireSeat(env, tableId, userId)
  if (snap.game.phase !== 'lobby') throw new UserError('The session already started.')
  const mine = myCharacter(snap, userId)
  if (!mine) throw new UserError('Pick a hero first.')
  await snap.tools.update<CharacterData>('characters', mine.recordId, { ready: params.ready !== false })
  return ok({ ready: params.ready !== false })
})

export const startGame: Handler = action(async ({ userId, params, env }) => {
  const tableId = requireTableId(params)
  const { table, snap } = await requireSeat(env, tableId, userId)
  if (table.data.hostId !== userId) throw new UserError('Only the host can start the session.')
  if (snap.game.phase !== 'lobby') throw new UserError('The session already started.')
  if (snap.characters.length === 0) throw new UserError('At least one player needs a hero.')
  if (snap.characters.some((c) => !c.data.ready)) throw new UserError('Waiting for every hero to be marked ready.')
  const adventure = await snap.tools.get<AdventureData>('adventure', ADVENTURE_ROW)
  if (adventure && adventure.data.status !== 'ready') throw new UserError('The DM is still writing your adventure.')

  const module = snap.module
  await patchGame(snap.tools, { startedAt: Date.now(), sceneId: module.scenes[0].id, round: 0 })
  snap.game.startedAt = Date.now()
  await roomTools(env, appRoomId(env)).update<TableData>('tables', tableId, { status: 'playing' })
  await addLog(snap.tools, { kind: 'system', text: module.scenes[0].title, data: { type: 'scene', sceneId: module.scenes[0].id, sceneType: module.scenes[0].type } })
  await queueDm(env, tableId, snap, 'opening')
  return ok({ started: true })
})

// ---------------------------------------------------------------------------
// Play
// ---------------------------------------------------------------------------

export const submitAction: Handler = action(async ({ userId, params, env }) => {
  const tableId = requireTableId(params)
  const { snap } = await requireSeat(env, tableId, userId)
  const mine = myCharacter(snap, userId)
  if (!mine) throw new UserError('You have no hero at this table.')
  if (mine.data.hp <= 0) throw new UserError(`${mine.data.name} is unconscious.`)
  const pass = params.pass === true
  const text = str(params.text, MAX_ACTION_CHARS)
  if (!pass && !text) throw new UserError('Describe what you do (or pass).')
  const { game } = snap

  if (game.phase === 'exploration') {
    const already = await snap.tools.query<LogData>('log', {
      where: { kind: 'action', round: game.round, characterId: mine.recordId },
      limit: 1,
    })
    if (already.length) throw new UserError('You already acted this round.')
    await addLog(snap.tools, { kind: 'action', text: pass ? '' : text, round: game.round, actorId: userId, characterId: mine.recordId, data: { pass } })
    if (await roundComplete(snap)) await queueDm(env, tableId, snap, 'round')
    return ok({ submitted: true })
  }

  if (game.phase === 'combat') {
    const actor = currentCombatant(game)
    if (actor?.id !== mine.recordId) throw new UserError(`It is ${actor?.name ?? 'someone else'}'s turn.`)
    await addLog(snap.tools, { kind: 'action', text: pass ? '' : text, round: game.round, actorId: userId, characterId: mine.recordId, data: { pass, combat: true } })
    await queueDm(env, tableId, snap, 'combat')
    return ok({ submitted: true })
  }

  throw new UserError(game.phase === 'rolls' ? 'Waiting on dice rolls.' : 'The DM is speaking. Hold that thought!')
})

async function finishRollsIfDone(env: Env, tableId: string, snap: TableSnapshot) {
  const pending = await snap.tools.query<RollData>('rolls', { where: { status: 'requested' }, limit: 20 })
  if (pending.length === 0) await queueDm(env, tableId, snap, 'rolls')
}

async function settleRoll(snap: TableSnapshot, roll: RecordData<RollData>, status: 'rolled' | 'auto') {
  const r = resolveRoll(roll.data.modifier, roll.data.dc, roll.data.mode, cryptoRng)
  await snap.tools.update<RollData>('rolls', roll.recordId, {
    status,
    natural: r.naturals,
    total: r.total,
    success: r.success,
  })
  return r
}

export const rollDice: Handler = action(async ({ userId, params, env }) => {
  const tableId = requireTableId(params)
  const { snap } = await requireSeat(env, tableId, userId)
  if (snap.game.phase !== 'rolls') throw new UserError('No roll is waiting.')
  const rollId = str(params.rollId, 64)
  const roll = await snap.tools.get<RollData>('rolls', rollId)
  if (!roll || roll.data.userId !== userId) throw new UserError('That roll is not yours.')
  if (roll.data.status !== 'requested') throw new UserError('Already rolled.')
  const r = await settleRoll(snap, roll, 'rolled')
  await finishRollsIfDone(env, tableId, snap)
  return ok({ natural: r.naturals, total: r.total, success: r.success })
})

/**
 * Timer expiry. Every client calls this when the visible countdown hits 0;
 * the turnSeq check makes it idempotent and the server re-checks the clock.
 */
async function resolveNow(env: Env, tableId: string, snap: TableSnapshot) {
  const { game } = snap
  if (game.phase === 'exploration') return queueDm(env, tableId, snap, 'round')
  if (game.phase === 'combat') {
    const actor = currentCombatant(game)
    if (actor) {
      await addLog(snap.tools, { kind: 'action', text: '', round: game.round, actorId: '', characterId: actor.id, data: { pass: true, combat: true, timeout: true } })
    }
    return queueDm(env, tableId, snap, 'combat')
  }
  if (game.phase === 'rolls') {
    const pending = await snap.tools.query<RollData>('rolls', { where: { status: 'requested' }, limit: 20 })
    for (const p of pending) await settleRoll(snap, p, 'auto')
    return queueDm(env, tableId, snap, 'rolls')
  }
  return false
}

export const tick: Handler = action(async ({ userId, params, env }) => {
  const tableId = requireTableId(params)
  const { snap } = await requireSeat(env, tableId, userId)
  const { game } = snap
  if (Number(params.turnSeq) !== game.turnSeq) return ok({ stale: true })
  if (!game.deadlineAt || Date.now() < game.deadlineAt - 1000) return ok({ early: true })
  await resolveNow(env, tableId, snap)
  return ok({ advanced: true })
})

async function requireHost(env: Env, tableId: string, userId: string) {
  const seat = await requireSeat(env, tableId, userId)
  if (seat.table.data.hostId !== userId) throw new UserError('Only the host can do that.')
  return seat
}

export const hostAdvance: Handler = action(async ({ userId, params, env }) => {
  const tableId = requireTableId(params)
  const { snap } = await requireHost(env, tableId, userId)
  if (!['exploration', 'combat', 'rolls'].includes(snap.game.phase)) throw new UserError('Nothing to skip right now.')
  await resolveNow(env, tableId, snap)
  return ok({ advanced: true })
})

export const retryDm: Handler = action(async ({ userId, params, env }) => {
  const tableId = requireTableId(params)
  const { table, snap } = await requireSeat(env, tableId, userId)
  const gameRow = await snap.tools.get<GameData>('game', GAME_ROW)
  const staleMs = gameRow ? Date.now() - Date.parse(gameRow.updatedAt) : 0
  const stalled = ['queued', 'thinking', 'narrating'].includes(snap.game.dmStatus) && staleMs > 120_000
  const errored = snap.game.dmStatus === 'error'
  // The host can retry a failed turn; anyone seated can unstick a stalled one.
  if (!stalled && !(errored && (table.data.hostId === userId || staleMs > 60_000))) {
    throw new UserError(errored ? 'Only the host can retry right now.' : 'The DM is still working.')
  }
  // Every attempt counts toward the turn budget (see runDmTurn); past it, only the chronicle remains.
  if (snap.game.turnsUsed >= MAX_DM_TURNS + 10 || snap.game.dmReason === 'recap' || snap.game.endRequested) {
    await queueRecap(env, tableId, snap, snap.game.outcome || 'unfinished')
    return ok({ retried: 'recap' })
  }
  const reason = (['opening', 'round', 'rolls', 'combat', 'finale'] as const).find((r) => r === snap.game.dmReason) ?? 'round'
  await queueDm(env, tableId, snap, reason)
  return ok({ retried: true })
})

export const endGame: Handler = action(async ({ userId, params, env }) => {
  const tableId = requireTableId(params)
  const { snap } = await requireHost(env, tableId, userId)
  if (snap.game.phase === 'ended') return ok({ ended: true })
  if (snap.game.phase === 'lobby') {
    await patchGame(snap.tools, { phase: 'ended' })
    await roomTools(env, appRoomId(env)).update<TableData>('tables', tableId, { status: 'ended' })
    return ok({ ended: true })
  }
  if (snap.game.phase === 'dm' && snap.game.dmStatus !== 'error') {
    // A DM turn is in flight; the engine writes the chronicle when it finishes.
    await patchGame(snap.tools, { endRequested: true })
    return ok({ ending: true })
  }
  await queueRecap(env, tableId, snap, 'unfinished')
  return ok({ ending: true })
})
