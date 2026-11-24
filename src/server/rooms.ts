/**
 * Room-parameterised record tools for server code (actions + DM job).
 *
 * Mirrors the scaffold's `createActionTools` in action-routes.ts, but can
 * target any RecordRoom (`app:<APP_ID>` or `table:<tableId>`). Requests carry
 * `X-App-Action: true`, so per-record RBAC is OFF: callers must authorise
 * (seat, host, turn) themselves before writing.
 */

import type { ActionResult } from 'deepspace/worker'
import type { Env } from '../../worker'

/** Record envelope as returned by the room tools API. */
export interface RecordData<T> {
  recordId: string
  data: T
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type RoomId = string

export const appRoomId = (env: Pick<Env, 'DEEPSPACE_APP_ID'>) => `app:${env.DEEPSPACE_APP_ID}`
export const tableRoomId = (tableId: string) => `table:${tableId}`

const TABLE_ID_RE = /^[a-z0-9]{8,32}$/
export const isValidTableId = (id: unknown): id is string => typeof id === 'string' && TABLE_ID_RE.test(id)

export class RoomError extends Error {
  constructor(
    message: string,
    readonly code = 'room_error',
  ) {
    super(message)
  }
}

export interface RoomTools {
  get<T>(collection: string, recordId: string): Promise<RecordData<T> | null>
  query<T>(
    collection: string,
    options?: { where?: Record<string, unknown>; orderBy?: string; orderDir?: 'asc' | 'desc'; limit?: number },
  ): Promise<RecordData<T>[]>
  create<T>(collection: string, data: T, recordId?: string): Promise<string>
  update<T>(collection: string, recordId: string, data: Partial<T>): Promise<void>
  remove(collection: string, recordId: string): Promise<void>
}

export function roomTools(env: Env, roomId: RoomId, actingUserId = env.OWNER_USER_ID): RoomTools {
  const stub = env.RECORD_ROOMS.get(env.RECORD_ROOMS.idFromName(roomId))

  async function exec<T>(tool: string, params: Record<string, unknown>): Promise<T> {
    const res = await stub.fetch(
      new Request('https://internal/api/tools/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': actingUserId,
          'X-App-Action': 'true',
        },
        body: JSON.stringify({ tool, params }),
      }),
    )
    const json = (await res.json()) as ActionResult<T>
    if (!json.success) {
      throw new RoomError(`${tool} on ${String(params.collection)} failed: ${json.error ?? 'unknown error'}`)
    }
    return json.data as T
  }

  return {
    async get<T>(collection: string, recordId: string) {
      try {
        const data = await exec<{ record?: RecordData<T> }>('records.get', { collection, recordId })
        return data?.record ?? null
      } catch (err) {
        if (err instanceof RoomError && /not found/i.test(err.message)) return null
        throw err
      }
    },
    async query<T>(collection: string, options = {}) {
      const data = await exec<{ records?: RecordData<T>[] }>('records.query', { collection, ...options })
      return data?.records ?? []
    },
    async create<T>(collection: string, data: T, recordId?: string) {
      const out = await exec<{ recordId?: string; record?: { recordId: string } }>('records.create', {
        collection,
        data,
        recordId,
      })
      return out?.recordId ?? out?.record?.recordId ?? recordId ?? ''
    },
    async update<T>(collection: string, recordId: string, data: Partial<T>) {
      await exec('records.update', { collection, recordId, data })
    },
    async remove(collection: string, recordId: string) {
      await exec('records.delete', { collection, recordId })
    },
  }
}

/** Short lowercase id usable in a room name. */
export function newId(len = 16): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const buf = new Uint8Array(len)
  crypto.getRandomValues(buf)
  return Array.from(buf, (b) => alphabet[b % alphabet.length]).join('')
}

/** Invite code: 6 chars, no lookalikes (0/O, 1/I/L). */
export function newInviteCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const buf = new Uint8Array(6)
  crypto.getRandomValues(buf)
  return Array.from(buf, (b) => alphabet[b % alphabet.length]).join('')
}
