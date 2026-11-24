/** Shared game types — used by the worker (actions, DM job) and the client. */

export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const
export type Ability = (typeof ABILITIES)[number]
export type Abilities = Record<Ability, number>

export const SKILLS = {
  acrobatics: 'dex',
  'animal handling': 'wis',
  arcana: 'int',
  athletics: 'str',
  deception: 'cha',
  history: 'int',
  insight: 'wis',
  intimidation: 'cha',
  investigation: 'int',
  medicine: 'wis',
  nature: 'int',
  perception: 'wis',
  performance: 'cha',
  persuasion: 'cha',
  religion: 'int',
  'sleight of hand': 'dex',
  stealth: 'dex',
  survival: 'wis',
} as const satisfies Record<string, Ability>
export type Skill = keyof typeof SKILLS

export interface Attack {
  name: string
  /** Ability used for to-hit and damage. */
  ability: Ability
  /** Damage dice expression WITHOUT the ability modifier, e.g. "1d8". */
  damage: string
  /** Whether the ability modifier is added to damage (weapons yes, most cantrips no). */
  addMod: boolean
  damageType: string
  /** Extra flat to-hit (e.g. Archery fighting style). */
  hitBonus?: number
  /** For save-based spells: the save the target makes instead of an attack roll. */
  save?: Ability
  note?: string
}

export interface Feature {
  name: string
  text: string
  uses?: number
  maxUses?: number
}

export interface Proficiencies {
  skills: Skill[]
  saves: Ability[]
}

export interface Pregen {
  id: string
  name: string
  className: string
  ancestry: string
  level: number
  abilities: Abilities
  ac: number
  maxHp: number
  speed: number
  prof: number
  proficiencies: Proficiencies
  attacks: Attack[]
  features: Feature[]
  inventory: string[]
  tagline: string
  backstory: string
  sigil: string
}

/** The `data` of a `characters` row. */
export interface CharacterData {
  userId: string
  pregenId: string
  name: string
  className: string
  ancestry: string
  level: number
  abilities: Abilities
  ac: number
  hp: number
  maxHp: number
  speed: number
  prof: number
  skills: Proficiencies
  attacks: Attack[]
  features: Feature[]
  inventory: string[]
  conditions: string[]
  backstory: string
  sigil: string
  tagline: string
  ready: boolean
  init?: number
}

export interface MonsterAttack {
  name: string
  toHit: number
  damage: string
  damageType: string
  note?: string
}

export interface Monster {
  id: string
  name: string
  ac: number
  hp: number
  initMod: number
  attacks: MonsterAttack[]
  traits: string[]
}

export interface EnemyData {
  name: string
  templateId: string
  hp: number
  maxHp: number
  ac: number
  attacks: MonsterAttack[]
  status: 'active' | 'down' | 'fled'
  init: number
}

export type SceneType = 'tavern' | 'marsh' | 'ruins' | 'crypt'

export interface EncounterGroup {
  monsterId: string
  /** Count at a party of one. */
  base: number
  /** Extra monsters per additional player (fractional, floored). */
  perExtraPlayer: number
  /** Optional display name override (e.g. the boss). */
  name?: string
}

export interface Encounter {
  id: string
  label: string
  groups: EncounterGroup[]
}

export interface Scene {
  id: string
  title: string
  type: SceneType
  goal: string
  description: string
  beats: string[]
  npcs: { name: string; role: string; secret?: string }[]
  hazards: string[]
  encounters: Encounter[]
  exits: string
  minutes: number
}

export interface AdventureModule {
  id: string
  title: string
  pitch: string
  tone: string
  premise: string
  opening: string
  scenes: Scene[]
  victory: string
  defeat: string
  targetMinutes: number
}

export type Phase = 'lobby' | 'exploration' | 'rolls' | 'combat' | 'dm' | 'ended'
export type DmStatus = 'idle' | 'queued' | 'thinking' | 'narrating' | 'error'

export interface Combatant {
  id: string
  kind: 'pc' | 'enemy'
  init: number
  name: string
}

export interface CombatState {
  active: boolean
  round: number
  order: Combatant[]
  turnIndex: number
}

/** The `data` of the single `game/state` row. */
export interface GameData {
  phase: Phase
  round: number
  sceneId: string
  hostId: string
  moduleId: string
  startedAt: number
  deadlineAt: number
  turnSeq: number
  dmStatus: DmStatus
  dmError: string
  dmReason: string
  combat: CombatState
  turnsUsed: number
  outcome: string
  fakeDm: boolean
}

export type LogKind = 'narration' | 'action' | 'system' | 'recap'

export interface LogData {
  kind: LogKind
  round: number
  actorId: string
  characterId: string
  text: string
  data: Record<string, unknown>
  streaming: boolean
  seq: number
}

export type RollKind = 'skill' | 'ability' | 'save' | 'attack'
export type RollMode = 'normal' | 'adv' | 'dis'

export interface RollData {
  characterId: string
  userId: string
  label: string
  kind: RollKind
  key: string
  dc: number
  mode: RollMode
  status: 'requested' | 'rolled' | 'auto'
  natural: number[]
  modifier: number
  total: number
  success: boolean
  round: number
  turnSeq: number
  reason: string
  seq: number
}

export interface TableData {
  code: string
  name: string
  hostId: string
  hostName: string
  status: 'lobby' | 'playing' | 'ended'
  visibility: 'public' | 'private'
  moduleId: string
  moduleTitle: string
  playerIds: string[]
  seatsTaken: number
  recap: { title: string; summary: string; outcome: string } | null
}

export interface Recap {
  title: string
  summary: string
  outcome: 'victory' | 'defeat' | 'unfinished'
  highlights: { characterId: string; name: string; moment: string }[]
}

export const MAX_SEATS = 5
export const ROUND_SECONDS = 90
export const COMBAT_TURN_SECONDS = 75
export const ROLL_SECONDS = 45
export const MAX_DM_TURNS = 80
export const MAX_ACTION_CHARS = 500
export const SESSION_TARGET_MIN = 25
