/**
 * WebSocket routing for app-owned Durable Objects.
 *
 * Caller identity in query parameters and headers is never trusted. Routes
 * scrub it and forward verified JWT identity in internal-only headers; the
 * documents-aware Yjs route additionally resolves an application role from
 * the documents collection.
 */

import type { Context, Hono } from 'hono'
import { authenticatedRoomRequest, resolveAppRole, verifyJwt } from 'deepspace/worker'
import type { JwtVerifierConfig, VerifyResult } from 'deepspace/worker'
import type { AppContext, Env } from '../../worker.js'

function jwtConfig(env: Env): JwtVerifierConfig {
  return { publicKey: env.AUTH_JWT_PUBLIC_KEY, issuer: env.AUTH_JWT_ISSUER }
}

/**
 * Which room names a socket may open. The app room is open (its collections
 * carry their own RBAC); a `table:<id>` room — records or presence — only
 * admits users seated at that table. Anything else is refused, so a client
 * cannot spin up arbitrary Durable Objects or read another table's game.
 */
type RoomGate = (id: string, auth: VerifyResult | null, env: Env) => Promise<Response | null>

const TABLE_ROOM_RE = /^table:([a-z0-9]{8,32})$/

async function isSeated(env: Env, tableId: string, userId: string): Promise<boolean> {
  if (userId === env.OWNER_USER_ID) return true
  const stub = env.RECORD_ROOMS.get(env.RECORD_ROOMS.idFromName(`app:${env.DEEPSPACE_APP_ID}`))
  try {
    const res = await stub.fetch(
      new Request('https://internal/api/tools/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': env.OWNER_USER_ID, 'X-App-Action': 'true' },
        body: JSON.stringify({ tool: 'records.get', params: { collection: 'tables', recordId: tableId } }),
      }),
    )
    const json = (await res.json()) as { success?: boolean; data?: { record?: { data?: { playerIds?: unknown } } } }
    const players = json.data?.record?.data?.playerIds
    return Array.isArray(players) && players.includes(userId)
  } catch {
    return false
  }
}

const tableGate =
  (appRoom: (env: Env) => string): RoomGate =>
  async (id, auth, env) => {
    if (id === appRoom(env)) return null
    const m = TABLE_ROOM_RE.exec(id)
    if (!m) return new Response('Not found', { status: 404 })
    if (!auth) return new Response('Unauthorized', { status: 401 })
    return (await isSeated(env, m[1], auth.userId)) ? null : new Response('Forbidden', { status: 403 })
  }

const recordRoomGate = tableGate((env) => `app:${env.DEEPSPACE_APP_ID}`)
/** Presence scopes: only per-table scopes are used by the app. */
const presenceGate = tableGate(() => '\u0000no-app-presence')

function wsRoute(
  doNamespace: (env: Env) => DurableObjectNamespace,
  extraIdentity?: (auth: VerifyResult, env: Env) => { role?: string } | Promise<{ role?: string }>,
  gate?: RoomGate,
) {
  return async (c: Context<AppContext>) => {
    const id = c.req.param('roomId') ?? c.req.param('docId') ?? c.req.param('scopeId')
    if (!id) return new Response('Not found', { status: 404 })
    const url = new URL(c.req.url)
    const token = url.searchParams.get('token')

    let auth: VerifyResult | null = null
    if (token) {
      auth = (await verifyJwt(jwtConfig(c.env), token)).result
      if (!auth) return new Response('Unauthorized', { status: 401 })
    }
    if (gate) {
      const refused = await gate(id, auth, c.env)
      if (refused) return refused
    }
    const roomRequest = authenticatedRoomRequest(
      c.req.raw,
      auth,
      auth ? await extraIdentity?.(auth, c.env) : undefined,
    )

    const namespace = doNamespace(c.env)
    const stub = namespace.get(namespace.idFromName(id))
    return stub.fetch(roomRequest)
  }
}

type DocsYjsRole = 'admin' | 'member' | 'viewer'

interface DocumentRecordForAccess {
  ownerId?: string
  collaborators?: string
  editors?: string
}

type DocumentAccessLookup =
  | { kind: 'found'; doc: DocumentRecordForAccess }
  | { kind: 'not-docs-room' }
  | { kind: 'error' }

function parseAccessList(raw: string | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

async function getDocumentForAccess(env: Env, docId: string): Promise<DocumentAccessLookup> {
  const stub = env.RECORD_ROOMS.get(env.RECORD_ROOMS.idFromName(`app:${env.DEEPSPACE_APP_ID}`))
  try {
    const res = await stub.fetch(
      new Request('https://internal/api/tools/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': env.OWNER_USER_ID,
          'X-App-Action': 'true',
        },
        body: JSON.stringify({
          tool: 'records.get',
          params: { collection: 'documents', recordId: docId },
        }),
      }),
    )
    const json = (await res.json()) as {
      success?: boolean
      error?: string
      data?: { record?: { data?: DocumentRecordForAccess } }
    }
    if (json.success && json.data?.record?.data) {
      return { kind: 'found', doc: json.data.record.data }
    }
    if (json.error?.startsWith('Schema not registered for collection: documents')) {
      return { kind: 'not-docs-room' }
    }
    return { kind: 'error' }
  } catch {
    return { kind: 'error' }
  }
}

async function resolveDocsYjsRole(
  env: Env,
  docId: string,
  userId: string,
): Promise<DocsYjsRole | null> {
  const lookup = await getDocumentForAccess(env, docId)
  if (lookup.kind === 'not-docs-room') return 'member'
  if (lookup.kind === 'error') return null
  const { doc } = lookup
  if (doc.ownerId === userId || userId === env.OWNER_USER_ID) return 'admin'

  const editors = parseAccessList(doc.editors)
  if (editors.includes(userId)) return 'member'

  const collaborators = parseAccessList(doc.collaborators)
  if (collaborators.includes(userId)) return 'viewer'

  return null
}

export function registerRealtimeRoutes(app: Hono<AppContext>): void {
  app.get(
    '/ws/:roomId',
    wsRoute((env) => env.RECORD_ROOMS, undefined, recordRoomGate),
  )

  // Inkbound uses only record rooms and presence over WebSockets. The
  // scaffold's Yjs, canvas, cron and jobs socket routes are not registered,
  // so clients cannot open (or spin up) those Durable Objects at all. DM
  // jobs are enqueued server-side with enqueueJob.

  app.get(
    '/ws/presence/:scopeId',
    wsRoute((env) => env.PRESENCE_ROOMS, undefined, presenceGate),
  )
}
