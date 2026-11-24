/**
 * Server-side game engine: loads table state and moves it between phases.
 *
 * The rule of the house: code decides WHEN things happen (rounds, timers,
 * whose turn, when the DM runs); the DM model decides WHAT happens in the
 * fiction, and changes numbers only through validated tools (src/game/dm).
 *
 * Every transition bumps `game.turnSeq`. A queued DM job carries the seq it
 * was queued for and no-ops if the table has moved on, so duplicate enqueues
 * from two simultaneous "last submit" requests are harmless — and because
 * jobs in one JobRoom run one at a time, DM turns per table never overlap.
 */

import { enqueueJob } from 'deepspace/worker'
import type { Env } from '../../worker'
import { roomTools, tableRoomId, type RecordData, type RoomTools } from '../server/rooms'
import { DEFAULT_MODULE_ID, MODULES } from './content/modules'
import {
  COMBAT_TURN_SECONDS,
  MAX_DM_TURNS,
  ROLL_SECONDS,
  ROUND_SECONDS,
  type AdventureData,
  type AdventureModule,
  type CharacterData,
  type CombatState,
  type Combatant,
  type EnemyData,
  type GameData,
  type LogData,
  type RollData,
} from './types'

export const GAME_ROW = 'state'
export const ADVENTURE_ROW = 'module'

export type DmReason = 'opening' | 'round' | 'rolls' | 'combat' | 'finale'

export interface DmJobPayload {
  tableId: string
  seq: number
  reason: DmReason
}

export interface TableSnapshot {
  tools: RoomTools
  game: GameData
  module: AdventureModule
  characters: RecordData<CharacterData>[]
  enemies: RecordData<EnemyData>[]
}

export const emptyCombat = (): CombatState => ({ active: false, round: 0, order: [], turnIndex: -1 })

export function initialGame(hostId: string, moduleId: string, sceneId: string, fakeDm: boolean): GameData {
  return {
    phase: 'lobby',
    round: 0,
    sceneId,
    hostId,
    moduleId,
    startedAt: 0,
    deadlineAt: 0,
    turnSeq: 0,
    dmStatus: 'idle',
    dmError: '',
    dmReason: '',
    combat: emptyCombat(),
    turnsUsed: 0,
    outcome: '',
    fakeDm,
    endRequested: false,
  }
}

export async function loadTable(env: Env, tableId: string): Promise<TableSnapshot | null> {
  const tools = roomTools(env, tableRoomId(tableId))
  const [gameRow, adventure, characters, enemies] = await Promise.all([
    tools.get<GameData>('game', GAME_ROW),
    tools.get<AdventureData>('adventure', ADVENTURE_ROW),
    tools.query<CharacterData>('characters', { limit: 10 }),
    tools.query<EnemyData>('enemies', { limit: 30 }),
  ])
  if (!gameRow) return null
  const game = normalizeGame(gameRow.data)
  const module = adventure?.data.module ?? MODULES[game.moduleId] ?? MODULES[DEFAULT_MODULE_ID]
  return { tools, game, module, characters, enemies }
}

function normalizeGame(g: Partial<GameData>): GameData {
  return {
    ...initialGame(g.hostId ?? '', g.moduleId ?? '', g.sceneId ?? '', Boolean(g.fakeDm)),
    ...g,
    combat: g.combat && typeof g.combat === 'object' ? g.combat : emptyCombat(),
  } as GameData
}

export async function patchGame(tools: RoomTools, patch: Partial<GameData>) {
  await tools.update<GameData>('game', GAME_ROW, patch)
}

let seqCounter = 0
/** Monotonic-ish ordering key for log rows (ms timestamp + per-isolate counter). */
export function nextSeq(): number {
  seqCounter = (seqCounter + 1) % 1000
  return Date.now() * 1000 + seqCounter
}

export async function addLog(tools: RoomTools, entry: Partial<LogData> & Pick<LogData, 'kind' | 'text'>): Promise<string> {
  const data: LogData = {
    round: 0,
    actorId: '',
    characterId: '',
    data: {},
    streaming: false,
    seq: nextSeq(),
    ...entry,
  }
  return tools.create<LogData>('log', data)
}

export const livingCharacters = (snap: TableSnapshot) => snap.characters.filter((c) => c.data.hp > 0)

/** Queue a DM turn. Returns false when the table already used its turn budget. */
export async function queueDm(env: Env, tableId: string, snap: TableSnapshot, reason: DmReason): Promise<boolean> {
  const seq = snap.game.turnSeq + 1
  const overBudget = snap.game.turnsUsed >= MAX_DM_TURNS && reason !== 'finale'
  const finalReason: DmReason = overBudget ? 'finale' : reason
  await patchGame(snap.tools, { phase: 'dm', dmStatus: 'queued', dmError: '', dmReason: finalReason, turnSeq: seq, deadlineAt: 0 })
  snap.game = { ...snap.game, phase: 'dm', dmStatus: 'queued', turnSeq: seq }
  await enqueueJob(env.JOB_ROOMS, tableRoomId(tableId), 'dm-turn', { tableId, seq, reason: finalReason } satisfies DmJobPayload, {
    maxAttempts: 2,
  })
  return !overBudget
}

export async function queueRecap(env: Env, tableId: string, snap: TableSnapshot, outcome: string) {
  const seq = snap.game.turnSeq + 1
  await patchGame(snap.tools, { phase: 'dm', dmStatus: 'queued', dmReason: 'recap', turnSeq: seq, outcome, deadlineAt: 0 })
  await enqueueJob(env.JOB_ROOMS, tableRoomId(tableId), 'recap', { tableId, seq, reason: 'finale' } satisfies DmJobPayload, {
    maxAttempts: 2,
  })
}

/** Open a new exploration round. */
export async function openRound(snap: TableSnapshot) {
  const round = snap.game.round + 1
  await patchGame(snap.tools, {
    phase: 'exploration',
    round,
    dmStatus: 'idle',
    turnSeq: snap.game.turnSeq + 1,
    deadlineAt: Date.now() + ROUND_SECONDS * 1000,
  })
}

export async function openRolls(snap: TableSnapshot) {
  await patchGame(snap.tools, {
    phase: 'rolls',
    dmStatus: 'idle',
    turnSeq: snap.game.turnSeq + 1,
    deadlineAt: Date.now() + ROLL_SECONDS * 1000,
  })
}

/** Index of the next living PC strictly after `from` in initiative order (wrapping). */
export function nextPcIndex(order: Combatant[], from: number, alive: (id: string) => boolean): { index: number; wrapped: boolean } | null {
  if (order.length === 0) return null
  for (let step = 1; step <= order.length; step++) {
    const i = (from + step) % order.length
    const c = order[i]
    if (c.kind === 'pc' && alive(c.id)) return { index: i, wrapped: from + step >= order.length }
  }
  return null
}

/** Enemies (alive) that act between `from` (exclusive) and the next PC turn. */
export function enemiesBetween(order: Combatant[], from: number, to: number, alive: (id: string) => boolean): Combatant[] {
  const out: Combatant[] = []
  if (order.length === 0) return out
  let i = (from + 1) % order.length
  let guard = 0
  while (i !== to && guard++ < order.length) {
    const c = order[i]
    if (c.kind === 'enemy' && alive(c.id)) out.push(c)
    i = (i + 1) % order.length
  }
  return out
}

export function isAliveFn(snap: TableSnapshot) {
  const alive = new Set<string>()
  for (const c of snap.characters) if (c.data.hp > 0) alive.add(c.recordId)
  for (const e of snap.enemies) if (e.data.status === 'active' && e.data.hp > 0) alive.add(e.recordId)
  return (id: string) => alive.has(id)
}

/** Advance combat to the next living PC's turn. */
export async function openNextCombatTurn(snap: TableSnapshot) {
  const combat = snap.game.combat
  const next = nextPcIndex(combat.order, combat.turnIndex, isAliveFn(snap))
  if (!next) return
  await patchGame(snap.tools, {
    phase: 'combat',
    dmStatus: 'idle',
    turnSeq: snap.game.turnSeq + 1,
    deadlineAt: Date.now() + COMBAT_TURN_SECONDS * 1000,
    combat: { ...combat, turnIndex: next.index, round: combat.round + (next.wrapped ? 1 : 0) },
  })
}

export function currentCombatant(game: GameData): Combatant | null {
  const { combat } = game
  if (!combat.active || combat.turnIndex < 0) return null
  return combat.order[combat.turnIndex] ?? null
}

/**
 * After a DM turn finishes, decide what happens next. Pure code — the model
 * never chooses the phase.
 */
export async function afterDmTurn(env: Env, tableId: string, opts: { endRequested: 'victory' | 'defeat' | null }) {
  const snap = await loadTable(env, tableId)
  if (!snap) return
  const living = livingCharacters(snap)

  if (opts.endRequested || snap.game.endRequested || living.length === 0) {
    const outcome = opts.endRequested ?? (snap.game.endRequested ? 'unfinished' : 'defeat')
    await queueRecap(env, tableId, snap, outcome)
    return
  }

  const pending = await snap.tools.query<RollData>('rolls', { where: { status: 'requested' }, limit: 20 })
  if (pending.length > 0) {
    await openRolls(snap)
    return
  }

  const combat = snap.game.combat
  if (combat.active) {
    const enemiesLeft = snap.enemies.some((e) => e.data.status === 'active' && e.data.hp > 0)
    if (!enemiesLeft) {
      await patchGame(snap.tools, { combat: { ...combat, active: false } })
      snap.game.combat = { ...combat, active: false }
      await addLog(snap.tools, { kind: 'system', text: 'The fight is over.', round: snap.game.round })
      await openRound(snap)
      return
    }
    await openNextCombatTurn(snap)
    return
  }

  if (snap.game.turnsUsed >= MAX_DM_TURNS) {
    await queueDm(env, tableId, snap, 'finale')
    return
  }
  await openRound(snap)
}

/** Has everyone who can act submitted for this exploration round? */
export async function roundComplete(snap: TableSnapshot): Promise<boolean> {
  const actions = await snap.tools.query<LogData>('log', { where: { kind: 'action', round: snap.game.round }, limit: 20 })
  const acted = new Set(actions.map((a) => a.data.characterId))
  return livingCharacters(snap).every((c) => acted.has(c.recordId))
}
