/**
 * Game collections.
 *
 * Two kinds of room hold these:
 *   - the app room (`app:<APP_ID>`) holds `tables`, the lobby index;
 *   - one room per table (`table:<tableId>`) holds that game's state.
 *
 * Every collection here is SERVER-WRITTEN ONLY: clients can read, never
 * create/update/delete. All mutations go through server actions
 * (src/actions) or the DM job (src/game/dm), which enforce seat, host and
 * turn rules themselves. That keeps dice, HP and turn order authoritative.
 */

import type { CollectionSchema, RolePermissions } from 'deepspace/schema'

const readOnly: RolePermissions = { read: true, create: false, update: false, delete: false }
const none: RolePermissions = { read: false, create: false, update: false, delete: false }

const text = (name: string, extra: Partial<{ required: boolean; maxLength: number }> = {}) => ({
  name,
  storage: 'text' as const,
  interpretation: 'plain',
  ...extra,
})
const num = (name: string) => ({ name, storage: 'number' as const, interpretation: 'plain' })
const json = (name: string) => ({ name, storage: 'text' as const, interpretation: { kind: 'json' as const } })
const bool = (name: string) => ({
  name,
  storage: 'number' as const,
  interpretation: { kind: 'boolean' as const },
})

/** Lobby index in the app room. Public tables are visible to every member;
 *  private ones only to the players seated at them. */
export const tablesSchema: CollectionSchema = {
  name: 'tables',
  columns: [
    text('code', { required: true }),
    text('name', { required: true, maxLength: 60 }),
    text('hostId', { required: true }),
    text('hostName'),
    { name: 'status', storage: 'text', interpretation: { kind: 'select', options: ['lobby', 'playing', 'ended'] } },
    { name: 'visibility', storage: 'text', interpretation: { kind: 'select', options: ['public', 'private'] } },
    text('moduleId'),
    text('moduleTitle'),
    json('playerIds'),
    num('seatsTaken'),
    json('recap'),
  ],
  uniqueOn: ['code'],
  collaboratorsField: 'playerIds',
  visibilityField: { field: 'visibility', value: 'public' },
  permissions: {
    '*': none,
    viewer: none,
    member: { read: 'shared', create: false, update: false, delete: false },
    admin: readOnly,
  },
}

const tableRoomPermissions: Record<string, RolePermissions> = {
  '*': none,
  viewer: none,
  member: readOnly,
  admin: readOnly,
}

/** One row (`state`) per table room: phase, round, timers, combat order. */
export const gameSchema: CollectionSchema = {
  name: 'game',
  columns: [
    text('phase'),
    num('round'),
    text('sceneId'),
    text('hostId'),
    text('moduleId'),
    num('startedAt'),
    num('deadlineAt'),
    num('turnSeq'),
    text('dmStatus'),
    text('dmError'),
    text('dmReason'),
    json('combat'),
    num('turnsUsed'),
    text('outcome'),
    bool('fakeDm'),
  ],
  permissions: tableRoomPermissions,
}

export const charactersSchema: CollectionSchema = {
  name: 'characters',
  columns: [
    text('userId', { required: true }),
    text('pregenId', { required: true }),
    text('name', { required: true, maxLength: 40 }),
    text('className'),
    text('ancestry'),
    num('level'),
    json('abilities'),
    num('ac'),
    num('hp'),
    num('maxHp'),
    num('speed'),
    num('prof'),
    json('skills'),
    json('attacks'),
    json('features'),
    json('inventory'),
    json('conditions'),
    text('backstory', { maxLength: 240 }),
    text('sigil'),
    text('tagline'),
    bool('ready'),
    num('init'),
  ],
  permissions: tableRoomPermissions,
}

export const enemiesSchema: CollectionSchema = {
  name: 'enemies',
  columns: [
    text('name', { required: true }),
    text('templateId'),
    num('hp'),
    num('maxHp'),
    num('ac'),
    json('attacks'),
    text('status'),
    num('init'),
  ],
  permissions: tableRoomPermissions,
}

/** The story feed: DM narration (streamed in place), player actions, system notes, recap. */
export const logSchema: CollectionSchema = {
  name: 'log',
  columns: [
    text('kind', { required: true }),
    num('round'),
    text('actorId'),
    text('characterId'),
    text('text'),
    json('data'),
    bool('streaming'),
    num('seq'),
  ],
  permissions: tableRoomPermissions,
}

/** Dice: requested by the DM, rolled by the player (server picks the number). */
export const rollsSchema: CollectionSchema = {
  name: 'rolls',
  columns: [
    text('characterId', { required: true }),
    text('userId'),
    text('label'),
    text('kind'),
    text('key'),
    num('dc'),
    text('mode'),
    text('status'),
    json('natural'),
    num('modifier'),
    num('total'),
    bool('success'),
    num('round'),
    num('turnSeq'),
    text('reason'),
    num('seq'),
  ],
  permissions: tableRoomPermissions,
}

/** Collections that live inside a `table:<id>` room (client mounts these). */
export const tableRoomSchemas: CollectionSchema[] = [
  gameSchema,
  charactersSchema,
  enemiesSchema,
  logSchema,
  rollsSchema,
]
