/**
 * Background-job handler — invoked by AppJobRoom (worker.ts).
 *
 * Each table has its own JobRoom (`table:<tableId>`), so DM turns for one
 * table run strictly one at a time while different tables run in parallel.
 * Jobs are enqueued only from server code (actions, the engine); the room
 * refuses every socket write (see AppJobRoom in worker.ts).
 */

import type { Job, JobContext } from 'deepspace/worker'
import type { Env } from '../worker'
import type { DmJobPayload } from './game/engine'
import { runDmTurn, runRecap } from './game/dm/run'

function isPayload(p: unknown): p is DmJobPayload {
  const x = p as DmJobPayload
  return !!x && typeof x.tableId === 'string' && typeof x.seq === 'number' && typeof x.reason === 'string'
}

export async function runJob(job: Job, ctx: JobContext, env: Env): Promise<unknown> {
  if (!isPayload(job.payload)) throw new Error(`Invalid payload for ${job.type}`)
  switch (job.type) {
    case 'dm-turn':
      return runDmTurn(env, job.payload, ctx)
    case 'recap':
      return runRecap(env, job.payload, ctx)
    default:
      throw new Error(`Unknown job type: ${job.type}`)
  }
}
