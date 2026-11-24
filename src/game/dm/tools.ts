/**
 * DM tools — the ONLY way the model changes game state.
 *
 * Every tool validates its input against the table (ids must exist, dice are
 * bounded, resources must be available), performs the mechanic with the
 * server RNG, writes a visible row to the story log, and returns the exact
 * outcome so the model narrates from facts rather than inventing numbers.
 *
 * `impl` holds plain functions (the fake DM used in tests calls them
 * directly); `buildAiTools` wraps them as AI SDK tools for the real model.
 */

import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import { MONSTERS } from '../content/monsters'
import { addLog, isAliveFn, nextSeq, patchGame, type TableSnapshot } from '../engine'
import {
  abilityMod,
  clampHp,
  cryptoRng,
  fmtMod,
  healthBand,
  rollDice,
  rollInitiative,
  rollLabel,
  rollModifier,
  scaledCount,
} from '../rules'
import type { CharacterData, EnemyData, RollData, RollKind, RollMode } from '../types'
import type { NarrationWriter } from './writer'

export interface ToolContext {
  snap: TableSnapshot
  writer: NarrationWriter
  /** Set by end_adventure. */
  endRequested: 'victory' | 'defeat' | null
  /** Set when request_rolls staged at least one roll. */
  rollsRequested: boolean
  /** Rolls staged this turn; written after the narration (see flushStagedRolls). */
  stagedRolls: RollData[]
  /** Item notes staged this turn; written after the narration. */
  stagedNotes: { text: string; characterId: string }[]
}

/**
 * Write staged rolls and item notes after the turn's narration, so a roll
 * request always appears below the story that leads to it, even when the
 * model called the tool before writing.
 */
export async function flushStagedRolls(ctx: ToolContext) {
  for (const n of ctx.stagedNotes) {
    await addLog(ctx.snap.tools, { kind: 'system', text: n.text, characterId: n.characterId, round: ctx.snap.game.round, data: { type: 'item' } })
  }
  for (const r of ctx.stagedRolls) {
    await ctx.snap.tools.create<RollData>('rolls', { ...r, seq: nextSeq() })
  }
  ctx.stagedNotes = []
  ctx.stagedRolls = []
}

type Result = Record<string, unknown>
const fail = (error: string): Result => ({ ok: false, error })

function findCharacter(ctx: ToolContext, id: string) {
  return ctx.snap.characters.find((c) => c.recordId === id || c.data.name.toLowerCase() === id.toLowerCase())
}
function findEnemy(ctx: ToolContext, id: string) {
  return ctx.snap.enemies.find((e) => e.recordId === id)
}

async function setCharacter(ctx: ToolContext, id: string, patch: Partial<CharacterData>) {
  const c = ctx.snap.characters.find((x) => x.recordId === id)
  if (c) c.data = { ...c.data, ...patch }
  await ctx.snap.tools.update<CharacterData>('characters', id, patch)
}
async function setEnemy(ctx: ToolContext, id: string, patch: Partial<EnemyData>) {
  const e = ctx.snap.enemies.find((x) => x.recordId === id)
  if (e) e.data = { ...e.data, ...patch }
  await ctx.snap.tools.update<EnemyData>('enemies', id, patch)
}

const diceText = (rolls: number[]) => (rolls.length ? `[${rolls.map((r) => Math.abs(r)).join(', ')}]` : '')

export const impl = {
  async request_rolls(
    ctx: ToolContext,
    input: {
      rolls: {
        characterId: string
        kind: RollKind
        key: string
        dc?: number
        targetEnemyId?: string
        mode?: RollMode
        reason: string
      }[]
    },
  ): Promise<Result> {
    const created: string[] = []
    const errors: string[] = []
    const pending = await ctx.snap.tools.query<RollData>('rolls', { where: { status: 'requested' }, limit: 20 })
    const pendingFor = new Set([...pending.map((p) => p.data.characterId), ...ctx.stagedRolls.map((r) => r.characterId)])
    for (const r of input.rolls.slice(0, 6)) {
      const c = findCharacter(ctx, r.characterId)
      if (!c) {
        errors.push(`Unknown characterId ${r.characterId}`)
        continue
      }
      if (c.data.hp <= 0) {
        errors.push(`${c.data.name} is unconscious and cannot roll`)
        continue
      }
      if (pendingFor.has(c.recordId)) {
        errors.push(`${c.data.name} already has a roll pending`)
        continue
      }
      const modifier = rollModifier(c.data, r.kind, r.key)
      if (modifier === null) {
        errors.push(
          r.kind === 'attack'
            ? `${c.data.name} has no attack "${r.key}". Their attacks: ${c.data.attacks.map((a) => a.name).join(', ')}`
            : `Unknown ${r.kind} "${r.key}"`,
        )
        continue
      }
      let dc = r.dc ?? 13
      let reason = r.reason
      if (r.kind === 'attack') {
        const target = r.targetEnemyId ? findEnemy(ctx, r.targetEnemyId) : undefined
        if (target) {
          dc = target.data.ac
          reason = `${reason} (vs ${target.data.name})`
        } else if (!r.dc) {
          errors.push(`Attack rolls need a valid targetEnemyId (or a dc)`)
          continue
        }
      }
      dc = Math.max(5, Math.min(30, Math.round(dc)))
      const label = rollLabel(r.kind, r.key)
      const row: RollData = {
        characterId: c.recordId,
        userId: c.data.userId,
        label,
        kind: r.kind,
        key: r.key.toLowerCase(),
        dc,
        mode: r.mode ?? 'normal',
        status: 'requested',
        natural: [],
        modifier,
        total: 0,
        success: false,
        round: ctx.snap.game.round,
        turnSeq: ctx.snap.game.turnSeq,
        reason: reason.slice(0, 120),
        seq: nextSeq(),
      }
      ctx.stagedRolls.push(row)
      pendingFor.add(c.recordId)
      created.push(`${c.data.name}: ${label} (${fmtMod(modifier)}, DC ${dc}${row.mode !== 'normal' ? `, ${row.mode === 'adv' ? 'advantage' : 'disadvantage'}` : ''})`)
    }
    if (created.length) ctx.rollsRequested = true
    return {
      ok: created.length > 0,
      requested: created,
      errors,
      instruction: created.length
        ? 'Rolls requested. Finish your narration with one short line inviting those players to roll, then stop. Do not narrate outcomes yet; results arrive next turn.'
        : 'No rolls were created.',
    }
  },

  async damage(ctx: ToolContext, input: { targetId: string; dice: string; damageType: string; crit?: boolean; reason?: string }): Promise<Result> {
    let roll
    try {
      roll = rollDice(input.dice, cryptoRng, { crit: input.crit })
    } catch (err) {
      return fail(String((err as Error).message))
    }
    const amount = Math.min(60, roll.total)
    const pc = findCharacter(ctx, input.targetId)
    const enemy = pc ? undefined : findEnemy(ctx, input.targetId)
    if (!pc && !enemy) return fail(`Unknown targetId ${input.targetId}`)
    if (pc) {
      const hp = clampHp(pc.data.hp - amount, pc.data.maxHp)
      const conditions = hp === 0 ? Array.from(new Set([...pc.data.conditions, 'unconscious'])) : pc.data.conditions
      await setCharacter(ctx, pc.recordId, { hp, conditions })
      await ctx.writer.note({
        kind: 'system',
        text: `${pc.data.name} takes ${amount} ${input.damageType} damage${input.crit ? ' (critical!)' : ''}${hp === 0 ? ' and falls unconscious' : ''}.`,
        characterId: pc.recordId,
        data: { type: 'damage', dice: input.dice, rolls: roll.rolls, total: amount, hp, maxHp: pc.data.maxHp, reason: input.reason ?? '' },
      })
      return { ok: true, target: pc.data.name, damage: amount, dice: `${input.dice} ${diceText(roll.rolls)}`, hp, maxHp: pc.data.maxHp, unconscious: hp === 0 }
    }
    const e = enemy!
    const hp = Math.max(0, e.data.hp - amount)
    const status = hp === 0 ? 'down' : e.data.status
    await setEnemy(ctx, e.recordId, { hp, status })
    const band = healthBand(hp, e.data.maxHp)
    await ctx.writer.note({
      kind: 'system',
      text: `${e.data.name} takes ${amount} ${input.damageType} damage${input.crit ? ' (critical!)' : ''}: ${band}.`,
      data: { type: 'damage', dice: input.dice, rolls: roll.rolls, total: amount, band, enemy: true, reason: input.reason ?? '' },
    })
    return { ok: true, target: e.data.name, damage: amount, dice: `${input.dice} ${diceText(roll.rolls)}`, hp, maxHp: e.data.maxHp, state: band, defeated: hp === 0 }
  },

  async heal(ctx: ToolContext, input: { characterId: string; dice: string; reason?: string }): Promise<Result> {
    const pc = findCharacter(ctx, input.characterId)
    if (!pc) return fail(`Unknown characterId ${input.characterId}`)
    let roll
    try {
      roll = rollDice(input.dice, cryptoRng)
    } catch (err) {
      return fail(String((err as Error).message))
    }
    const hp = clampHp(pc.data.hp + Math.min(40, roll.total), pc.data.maxHp)
    const conditions = hp > 0 ? pc.data.conditions.filter((c) => c !== 'unconscious') : pc.data.conditions
    await setCharacter(ctx, pc.recordId, { hp, conditions })
    await ctx.writer.note({
      kind: 'system',
      text: `${pc.data.name} regains ${hp - pc.data.hp >= 0 ? roll.total : 0} HP.`,
      characterId: pc.recordId,
      data: { type: 'heal', dice: input.dice, rolls: roll.rolls, total: roll.total, hp, maxHp: pc.data.maxHp, reason: input.reason ?? '' },
    })
    return { ok: true, target: pc.data.name, healed: roll.total, hp, maxHp: pc.data.maxHp }
  },

  async enemy_attack(ctx: ToolContext, input: { enemyId: string; attackName?: string; targetCharacterId: string; mode?: RollMode }): Promise<Result> {
    const e = findEnemy(ctx, input.enemyId)
    if (!e || e.data.status !== 'active' || e.data.hp <= 0) return fail(`Enemy ${input.enemyId} is not able to act`)
    const pc = findCharacter(ctx, input.targetCharacterId)
    if (!pc) return fail(`Unknown targetCharacterId ${input.targetCharacterId}`)
    const atk =
      e.data.attacks.find((a) => a.name.toLowerCase() === (input.attackName ?? '').toLowerCase()) ?? e.data.attacks[0]
    if (!atk) return fail(`${e.data.name} has no attacks`)
    const a = cryptoRng(20)
    const b = input.mode && input.mode !== 'normal' ? cryptoRng(20) : a
    const natural = input.mode === 'adv' ? Math.max(a, b) : input.mode === 'dis' ? Math.min(a, b) : a
    const total = natural + atk.toHit
    const crit = natural === 20
    const hit = crit || (natural !== 1 && total >= pc.data.ac)
    let dmg = 0
    let rolls: number[] = []
    if (hit) {
      const r = rollDice(atk.damage, cryptoRng, { crit })
      dmg = Math.min(60, r.total)
      rolls = r.rolls
    }
    const hp = clampHp(pc.data.hp - dmg, pc.data.maxHp)
    const conditions = hp === 0 ? Array.from(new Set([...pc.data.conditions, 'unconscious'])) : pc.data.conditions
    if (hit) await setCharacter(ctx, pc.recordId, { hp, conditions })
    await ctx.writer.note({
      kind: 'system',
      text: hit
        ? `${e.data.name}'s ${atk.name} hits ${pc.data.name} for ${dmg} ${atk.damageType}${crit ? ' (critical!)' : ''}${hp === 0 ? '. They fall unconscious' : ''}.`
        : `${e.data.name}'s ${atk.name} misses ${pc.data.name}.`,
      characterId: pc.recordId,
      data: { type: 'enemy-attack', natural, toHit: atk.toHit, total, ac: pc.data.ac, hit, crit, damage: dmg, rolls, hp, maxHp: pc.data.maxHp },
    })
    return {
      ok: true,
      attacker: e.data.name,
      attack: atk.name,
      roll: `${natural} ${fmtMod(atk.toHit)} = ${total} vs AC ${pc.data.ac}`,
      hit,
      crit,
      damage: dmg,
      targetHp: `${hp}/${pc.data.maxHp}`,
      targetUnconscious: hp === 0,
      note: atk.note ?? '',
    }
  },

  async roll_dice(ctx: ToolContext, input: { dice: string; reason: string }): Promise<Result> {
    let roll
    try {
      roll = rollDice(input.dice, cryptoRng)
    } catch (err) {
      return fail(String((err as Error).message))
    }
    await ctx.writer.note({
      kind: 'system',
      text: `The DM rolls ${input.dice} for ${input.reason.slice(0, 80)}: ${roll.total}.`,
      data: { type: 'dm-roll', dice: input.dice, rolls: roll.rolls, total: roll.total },
    })
    return { ok: true, total: roll.total, rolls: roll.rolls }
  },

  async use_resource(ctx: ToolContext, input: { characterId: string; feature: string; amount?: number }): Promise<Result> {
    const pc = findCharacter(ctx, input.characterId)
    if (!pc) return fail(`Unknown characterId ${input.characterId}`)
    const name = input.feature.toLowerCase()
    const features = pc.data.features.map((f) => ({ ...f }))
    const f = features.find((x) => x.name.toLowerCase() === name) ?? features.find((x) => x.name.toLowerCase().includes(name))
    if (!f) return fail(`${pc.data.name} has no feature "${input.feature}". Features: ${features.map((x) => x.name).join(', ')}`)
    if (f.maxUses === undefined) return { ok: true, note: `${f.name} has no limited uses.` }
    const amount = Math.max(1, Math.min(3, input.amount ?? 1))
    if ((f.uses ?? 0) < amount) return fail(`${pc.data.name} has no ${f.name} left (${f.uses ?? 0}/${f.maxUses}).`)
    f.uses = (f.uses ?? 0) - amount
    await setCharacter(ctx, pc.recordId, { features })
    return { ok: true, feature: f.name, remaining: `${f.uses}/${f.maxUses}` }
  },

  async set_condition(ctx: ToolContext, input: { targetId: string; condition: string; active: boolean }): Promise<Result> {
    const condition = input.condition.toLowerCase().slice(0, 24)
    const pc = findCharacter(ctx, input.targetId)
    if (!pc) return fail(`Unknown targetId ${input.targetId} (conditions apply to characters only)`)
    const conditions = input.active
      ? Array.from(new Set([...pc.data.conditions, condition]))
      : pc.data.conditions.filter((c) => c !== condition)
    await setCharacter(ctx, pc.recordId, { conditions })
    return { ok: true, target: pc.data.name, conditions }
  },

  async inventory(ctx: ToolContext, input: { characterId: string; item: string; action: 'add' | 'remove' }): Promise<Result> {
    const pc = findCharacter(ctx, input.characterId)
    if (!pc) return fail(`Unknown characterId ${input.characterId}`)
    const item = input.item.slice(0, 48)
    const inv = [...pc.data.inventory]
    if (input.action === 'add') {
      inv.push(item)
    } else {
      const i = inv.findIndex((x) => x.toLowerCase().includes(item.toLowerCase()))
      if (i < 0) return fail(`${pc.data.name} has no "${item}"`)
      inv.splice(i, 1)
    }
    await setCharacter(ctx, pc.recordId, { inventory: inv.slice(0, 30) })
    if (input.action === 'add') ctx.stagedNotes.push({ text: `${pc.data.name} receives: ${item}.`, characterId: pc.recordId })
    return { ok: true, inventory: inv }
  },

  async start_combat(ctx: ToolContext, input: { encounterId: string }): Promise<Result> {
    const { snap } = ctx
    if (snap.game.combat.active) return fail('Combat is already active.')
    const mod = snap.module
    const encounter = mod?.scenes.flatMap((s) => s.encounters).find((e) => e.id === input.encounterId)
    if (!encounter) {
      return fail(`Unknown encounterId. Valid: ${mod?.scenes.flatMap((s) => s.encounters.map((e) => e.id)).join(', ')}`)
    }
    // Clear out enemies from an earlier fight.
    for (const old of snap.enemies) await snap.tools.remove('enemies', old.recordId)
    snap.enemies = []
    const party = snap.characters.filter((c) => c.data.hp > 0)
    for (const g of encounter.groups) {
      const m = MONSTERS[g.monsterId]
      if (!m) continue
      const count = scaledCount(g.base, g.perExtraPlayer, party.length)
      for (let i = 0; i < count; i++) {
        const name = g.name ?? (count > 1 ? `${m.name} ${String.fromCharCode(65 + i)}` : m.name)
        const data: EnemyData = { name, templateId: m.id, hp: m.hp, maxHp: m.hp, ac: m.ac, attacks: m.attacks, status: 'active', init: 0 }
        const id = await snap.tools.create<EnemyData>('enemies', data)
        snap.enemies.push({ recordId: id, data, createdBy: '', createdAt: '', updatedAt: '' })
      }
    }
    const order = rollInitiative(
      party.map((c) => ({ id: c.recordId, name: c.data.name, dexMod: abilityMod(c.data.abilities.dex) })),
      snap.enemies.map((e) => ({ id: e.recordId, name: e.data.name, initMod: MONSTERS[e.data.templateId]?.initMod ?? 0 })),
      cryptoRng,
    )
    for (const c of order) {
      if (c.kind === 'enemy') await setEnemy(ctx, c.id, { init: c.init })
      else await setCharacter(ctx, c.id, { init: c.init })
    }
    const firstPc = order.findIndex((c) => c.kind === 'pc')
    const before = order.slice(0, Math.max(0, firstPc)).filter((c) => c.kind === 'enemy')
    const combat = { active: true, round: 1, order, turnIndex: firstPc - 1 }
    snap.game.combat = combat
    await patchGame(snap.tools, { combat })
    await ctx.writer.note({
      kind: 'system',
      text: `Combat! Initiative: ${order.map((c) => `${c.name} ${c.init}`).join(' · ')}`,
      data: { type: 'initiative', order },
    })
    return {
      ok: true,
      enemies: snap.enemies.map((e) => ({ id: e.recordId, name: e.data.name, hp: e.data.hp, ac: e.data.ac, attacks: e.data.attacks })),
      initiative: order.map((c) => `${c.name} (${c.kind}, ${c.init})`),
      instruction: before.length
        ? `These enemies act before any player: ${before.map((b) => `${b.name} [${b.id}]`).join(', ')}. Run their turns now with enemy_attack, then announce that it is ${order[firstPc]?.name}'s turn and stop.`
        : `${order[firstPc]?.name} acts first. Announce that it is their turn and stop.`,
    }
  },

  async end_combat(ctx: ToolContext, input: { reason: string }): Promise<Result> {
    const { snap } = ctx
    if (!snap.game.combat.active) return { ok: true, note: 'No combat was active.' }
    for (const e of snap.enemies) if (e.data.status === 'active') await setEnemy(ctx, e.recordId, { status: 'fled' })
    snap.game.combat = { ...snap.game.combat, active: false }
    await patchGame(snap.tools, { combat: snap.game.combat })
    await ctx.writer.note({ kind: 'system', text: `The fight ends: ${input.reason.slice(0, 80)}.`, data: { type: 'combat-end' } })
    return { ok: true }
  },

  async advance_scene(ctx: ToolContext, input: { sceneId: string }): Promise<Result> {
    const mod = ctx.snap.module
    const scene = mod?.scenes.find((s) => s.id === input.sceneId)
    if (!scene) return fail(`Unknown sceneId. Valid: ${mod?.scenes.map((s) => s.id).join(', ')}`)
    if (scene.id === ctx.snap.game.sceneId) return { ok: true, note: 'Already in that scene.' }
    ctx.snap.game.sceneId = scene.id
    await patchGame(ctx.snap.tools, { sceneId: scene.id })
    await ctx.writer.note({ kind: 'system', text: scene.title, data: { type: 'scene', sceneId: scene.id, sceneType: scene.type } })
    return { ok: true, scene: scene.title, goal: scene.goal }
  },

  async end_adventure(ctx: ToolContext, input: { outcome: 'victory' | 'defeat' }): Promise<Result> {
    ctx.endRequested = input.outcome
    return { ok: true, instruction: 'The adventure ends after this narration. Finish the closing paragraph now.' }
  },
}

const idDesc = 'Use the exact id shown in the table state.'

export function buildAiTools(ctx: ToolContext): ToolSet {
  return {
    request_rolls: tool({
      description:
        'Ask one or more players to roll. Use when an action has an uncertain, interesting outcome. kind "attack" uses an attack from the character sheet (key = attack name) against targetEnemyId (DC becomes its AC). After calling, end your turn: results arrive next turn.',
      inputSchema: z.object({
        rolls: z
          .array(
            z.object({
              characterId: z.string().describe(idDesc),
              kind: z.enum(['skill', 'ability', 'save', 'attack']),
              key: z.string().describe('Skill name (e.g. "athletics"), ability (str/dex/con/int/wis/cha), or attack name from the sheet'),
              dc: z.number().int().min(5).max(30).optional().describe('Difficulty: 10 easy, 13 medium, 15 hard, 18 very hard. Omit for attacks with a target.'),
              targetEnemyId: z.string().optional(),
              mode: z.enum(['normal', 'adv', 'dis']).optional(),
              reason: z.string().max(120).describe('Short, player-facing: what the roll is for'),
            }),
          )
          .min(1)
          .max(6),
      }),
      execute: (input) => impl.request_rolls(ctx, input),
    }),
    damage: tool({
      description:
        'Deal damage to a character or enemy. dice like "1d8+3" (include the ability modifier for weapon attacks). Set crit for a natural 20 (dice doubled).',
      inputSchema: z.object({
        targetId: z.string().describe(idDesc),
        dice: z.string().max(40),
        damageType: z.string().max(20),
        crit: z.boolean().optional(),
        reason: z.string().max(80).optional(),
      }),
      execute: (input) => impl.damage(ctx, input),
    }),
    heal: tool({
      description: 'Restore hit points to a character with a dice expression (e.g. Cure Wounds "1d8+6").',
      inputSchema: z.object({ characterId: z.string().describe(idDesc), dice: z.string().max(40), reason: z.string().max(80).optional() }),
      execute: (input) => impl.heal(ctx, input),
    }),
    enemy_attack: tool({
      description: "Resolve one enemy attack against a character. The server rolls to-hit vs the target's AC and damage.",
      inputSchema: z.object({
        enemyId: z.string().describe(idDesc),
        attackName: z.string().optional(),
        targetCharacterId: z.string().describe(idDesc),
        mode: z.enum(['normal', 'adv', 'dis']).optional(),
      }),
      execute: (input) => impl.enemy_attack(ctx, input),
    }),
    roll_dice: tool({
      description: 'Roll dice for the DM (enemy saves, random events). Shown to players.',
      inputSchema: z.object({ dice: z.string().max(40), reason: z.string().max(80) }),
      execute: (input) => impl.roll_dice(ctx, input),
    }),
    use_resource: tool({
      description: 'Spend a limited feature or spell slot (e.g. "1st-level slots", "Second Wind", "Turn Undead").',
      inputSchema: z.object({ characterId: z.string().describe(idDesc), feature: z.string().max(40), amount: z.number().int().min(1).max(3).optional() }),
      execute: (input) => impl.use_resource(ctx, input),
    }),
    set_condition: tool({
      description: 'Add or remove a condition on a character (poisoned, frightened, paralyzed, prone, blessed...).',
      inputSchema: z.object({ targetId: z.string().describe(idDesc), condition: z.string().max(24), active: z.boolean() }),
      execute: (input) => impl.set_condition(ctx, input),
    }),
    inventory: tool({
      description: 'Give a character an item they found or remove one they used up or gave away.',
      inputSchema: z.object({ characterId: z.string().describe(idDesc), item: z.string().max(48), action: z.enum(['add', 'remove']) }),
      execute: (input) => impl.inventory(ctx, input),
    }),
    start_combat: tool({
      description: 'Start a fight using one of the adventure encounters. The server creates enemies (scaled to party size) and rolls initiative.',
      inputSchema: z.object({ encounterId: z.string() }),
      execute: (input) => impl.start_combat(ctx, input),
    }),
    end_combat: tool({
      description: 'End combat early (enemies flee, surrender, or the party escapes). Not needed when all enemies are down.',
      inputSchema: z.object({ reason: z.string().max(80) }),
      execute: (input) => impl.end_combat(ctx, input),
    }),
    advance_scene: tool({
      description: 'Move the party to another scene of the adventure when they travel there.',
      inputSchema: z.object({ sceneId: z.string() }),
      execute: (input) => impl.advance_scene(ctx, input),
    }),
    end_adventure: tool({
      description: 'Call once, when the final goal is achieved (victory) or the whole party has fallen (defeat), right before your closing narration.',
      inputSchema: z.object({ outcome: z.enum(['victory', 'defeat']) }),
      execute: (input) => impl.end_adventure(ctx, input),
    }),
  }
}

export { isAliveFn, addLog }
