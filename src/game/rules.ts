/**
 * Rules engine — pure, deterministic given an RNG. The server is the only
 * caller that passes a real RNG; the client uses these helpers to display
 * modifiers. Everything follows the 5e SRD 5.1 (CC-BY-4.0), simplified.
 */

import { SKILLS, type Ability, type CharacterData, type Combatant, type RollKind, type RollMode, type Skill } from './types'

export type Rng = (sides: number) => number

/** Cryptographically random die roll (worker + browser both have crypto). */
export const cryptoRng: Rng = (sides) => {
  const max = Math.floor(0xffffffff / sides) * sides
  const buf = new Uint32Array(1)
  let n: number
  do {
    crypto.getRandomValues(buf)
    n = buf[0]
  } while (n >= max)
  return (n % sides) + 1
}

const ALLOWED_SIDES = new Set([2, 3, 4, 6, 8, 10, 12, 20, 100])

export interface DiceTerm {
  count: number
  sides: number
  sign: 1 | -1
}

export interface ParsedDice {
  terms: DiceTerm[]
  flat: number
}

/** Parse "2d6+1d4+3" / "1d8-1" / "4". Bounded so a model can't request 1000d1000. */
export function parseDice(expr: string): ParsedDice {
  const cleaned = expr.replace(/\s+/g, '').toLowerCase()
  if (!cleaned || cleaned.length > 40) throw new Error(`Invalid dice expression: ${expr}`)
  const parts = cleaned.match(/[+-]?[^+-]+/g)
  if (!parts) throw new Error(`Invalid dice expression: ${expr}`)
  const terms: DiceTerm[] = []
  let flat = 0
  let totalDice = 0
  for (const part of parts) {
    const sign: 1 | -1 = part.startsWith('-') ? -1 : 1
    const body = part.replace(/^[+-]/, '')
    const m = body.match(/^(\d*)d(\d+)$/)
    if (m) {
      const count = m[1] ? Number(m[1]) : 1
      const sides = Number(m[2])
      if (!ALLOWED_SIDES.has(sides) || count < 1) throw new Error(`Invalid dice term: ${part}`)
      totalDice += count
      terms.push({ count, sides, sign })
    } else if (/^\d+$/.test(body)) {
      flat += sign * Number(body)
    } else {
      throw new Error(`Invalid dice term: ${part}`)
    }
  }
  if (totalDice > 20 || Math.abs(flat) > 50) throw new Error(`Dice expression too large: ${expr}`)
  return { terms, flat }
}

export interface DiceResult {
  expr: string
  rolls: number[]
  total: number
}

export function rollDice(expr: string, rng: Rng, opts: { crit?: boolean } = {}): DiceResult {
  const parsed = parseDice(expr)
  const rolls: number[] = []
  let total = parsed.flat
  for (const term of parsed.terms) {
    const count = opts.crit ? term.count * 2 : term.count
    for (let i = 0; i < count; i++) {
      const r = rng(term.sides)
      rolls.push(term.sign * r)
      total += term.sign * r
    }
  }
  return { expr, rolls, total: Math.max(0, total) }
}

export const abilityMod = (score: number) => Math.floor((score - 10) / 2)
export const fmtMod = (n: number) => (n >= 0 ? `+${n}` : `${n}`)

export function isSkill(key: string): key is Skill {
  return key in SKILLS
}

/** The modifier a character adds for a given check. Returns null for an unknown key. */
export function rollModifier(c: Pick<CharacterData, 'abilities' | 'prof' | 'skills' | 'attacks'>, kind: RollKind, key: string): number | null {
  const k = key.toLowerCase().trim()
  if (kind === 'skill') {
    if (!isSkill(k)) return null
    const ab = SKILLS[k]
    return abilityMod(c.abilities[ab]) + (c.skills.skills.includes(k) ? c.prof : 0)
  }
  if (kind === 'ability' || kind === 'save') {
    if (!(k in c.abilities)) return null
    const ab = k as Ability
    return abilityMod(c.abilities[ab]) + (kind === 'save' && c.skills.saves.includes(ab) ? c.prof : 0)
  }
  // attack: match by attack name (case-insensitive, prefix ok)
  const atk = c.attacks.find((a) => a.name.toLowerCase() === k) ?? c.attacks.find((a) => a.name.toLowerCase().startsWith(k))
  if (!atk) return null
  return abilityMod(c.abilities[atk.ability]) + c.prof + (atk.hitBonus ?? 0)
}

export function rollD20(mode: RollMode, rng: Rng): { naturals: number[]; chosen: number } {
  const a = rng(20)
  if (mode === 'normal') return { naturals: [a], chosen: a }
  const b = rng(20)
  return { naturals: [a, b], chosen: mode === 'adv' ? Math.max(a, b) : Math.min(a, b) }
}

export function rollLabel(kind: RollKind, key: string): string {
  const name = key.replace(/\b\w/g, (ch) => ch.toUpperCase())
  if (kind === 'skill') return `${name} check`
  if (kind === 'ability') return `${name.toUpperCase()} check`
  if (kind === 'save') return `${name.toUpperCase()} save`
  return `${name} attack`
}

export interface ResolvedRoll {
  naturals: number[]
  chosen: number
  modifier: number
  total: number
  success: boolean
  crit: boolean
  fumble: boolean
}

export function resolveRoll(modifier: number, dc: number, mode: RollMode, rng: Rng): ResolvedRoll {
  const { naturals, chosen } = rollD20(mode, rng)
  const total = chosen + modifier
  const crit = chosen === 20
  const fumble = chosen === 1
  // Natural 20/1 auto-succeed/fail only matters for attacks in RAW; we apply it
  // to everything because it reads well at the table.
  const success = crit ? true : fumble ? false : total >= dc
  return { naturals, chosen, modifier, total, success, crit, fumble }
}

export function rollInitiative(
  pcs: { id: string; name: string; dexMod: number }[],
  enemies: { id: string; name: string; initMod: number }[],
  rng: Rng,
): Combatant[] {
  const all = [
    ...pcs.map((p) => ({ id: p.id, name: p.name, kind: 'pc' as const, init: rng(20) + p.dexMod, tie: p.dexMod + 0.5 })),
    ...enemies.map((e) => ({ id: e.id, name: e.name, kind: 'enemy' as const, init: rng(20) + e.initMod, tie: e.initMod })),
  ]
  all.sort((a, b) => b.init - a.init || b.tie - a.tie)
  return all.map(({ id, name, kind, init }) => ({ id, name, kind, init }))
}

export const clampHp = (hp: number, maxHp: number) => Math.max(0, Math.min(maxHp, Math.round(hp)))

/** Narrative health band shown for enemies (players never see exact enemy HP). */
export function healthBand(hp: number, maxHp: number): 'unhurt' | 'wounded' | 'bloodied' | 'near death' | 'down' {
  if (hp <= 0) return 'down'
  const r = hp / maxHp
  if (r >= 1) return 'unhurt'
  if (r > 0.5) return 'wounded'
  if (r > 0.2) return 'bloodied'
  return 'near death'
}

/** Count monsters for a party size. */
export function scaledCount(base: number, perExtraPlayer: number, partySize: number) {
  return Math.max(1, base + Math.floor(perExtraPlayer * Math.max(0, partySize - 1)))
}
