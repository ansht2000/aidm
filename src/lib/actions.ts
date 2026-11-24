/** Client helper for server actions (POST /api/actions/:name). */

import { useCallback, useState } from 'react'
import { getAuthToken } from 'deepspace'
import { useToast } from '@/components/ui'

export interface ActionOutcome<T> {
  success: boolean
  data?: T
  error?: string
}

export async function runAction<T = unknown>(name: string, params: Record<string, unknown>): Promise<ActionOutcome<T>> {
  const token = await getAuthToken()
  if (!token) return { success: false, error: 'Please sign in first.' }
  try {
    const res = await fetch(`/api/actions/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(params),
    })
    const body = (await res.json().catch(() => null)) as ActionOutcome<T> | null
    if (!body) return { success: false, error: `Request failed (${res.status}).` }
    return body
  } catch {
    return { success: false, error: 'Network error. Check your connection.' }
  }
}

/** Run an action with a pending flag and toast on failure. */
export function useAction() {
  const [pending, setPending] = useState<string | null>(null)
  const { error } = useToast()
  const run = useCallback(
    async <T,>(name: string, params: Record<string, unknown>, opts: { quiet?: boolean } = {}) => {
      setPending(name)
      try {
        const out = await runAction<T>(name, params)
        if (!out.success && !opts.quiet) error('That did not work', out.error ?? 'Unknown error')
        return out
      } finally {
        setPending(null)
      }
    },
    [error],
  )
  return { run, pending }
}
