/**
 * Live table data for the play screen. Must render inside
 * <RecordScope roomId={`table:${tableId}`} schemas={tableRoomSchemas}>.
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery, usePresenceRoom } from 'deepspace'
import type { CharacterData, EnemyData, GameData, LogData, RollData, TableData } from '@/game/types'

type Rec<T> = { recordId: string; data: T; createdAt: string; updatedAt: string; createdBy: string }

export interface TableCtx {
  tableId: string
  table: Rec<TableData>
  userId: string
  isHost: boolean
  game: GameData | null
  gameUpdatedAt: string
  characters: Rec<CharacterData>[]
  enemies: Rec<EnemyData>[]
  log: Rec<LogData>[]
  rolls: Rec<RollData>[]
  mine: Rec<CharacterData> | null
  online: Set<string>
  typing: Set<string>
  setTyping: (typing: boolean) => void
  nameOf: (userId: string) => string
  ready: boolean
}

const Ctx = createContext<TableCtx | null>(null)

export function useTable(): TableCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTable must be used inside <TableProvider>')
  return ctx
}

export function TableProvider({
  tableId,
  table,
  userId,
  nameOf,
  children,
}: {
  tableId: string
  table: Rec<TableData>
  userId: string
  nameOf: (userId: string) => string
  children: ReactNode
}) {
  const gameQ = useQuery<GameData>('game')
  const charQ = useQuery<CharacterData>('characters', { orderBy: 'createdAt', orderDir: 'asc' })
  const enemyQ = useQuery<EnemyData>('enemies', { orderBy: 'createdAt', orderDir: 'asc' })
  const logQ = useQuery<LogData>('log', { orderBy: 'seq', orderDir: 'asc', limit: 600 })
  const rollQ = useQuery<RollData>('rolls', { orderBy: 'seq', orderDir: 'asc', limit: 300 })
  const { peers, updateState, connected } = usePresenceRoom(`table:${tableId}`)

  const [selfTyping, setSelfTyping] = useState(false)
  useEffect(() => {
    if (connected) updateState({ typing: selfTyping })
  }, [selfTyping, connected, updateState])

  const value = useMemo<TableCtx>(() => {
    const gameRow = gameQ.records.find((r) => r.recordId === 'state') ?? gameQ.records[0]
    const characters = charQ.records as Rec<CharacterData>[]
    const online = new Set<string>([userId, ...peers.map((p) => p.userId)])
    const typing = new Set<string>(peers.filter((p) => p.state?.typing).map((p) => p.userId))
    return {
      tableId,
      table,
      userId,
      isHost: table.data.hostId === userId,
      game: gameRow ? (gameRow.data as GameData) : null,
      gameUpdatedAt: gameRow?.updatedAt ?? '',
      characters,
      enemies: enemyQ.records as Rec<EnemyData>[],
      log: logQ.records as Rec<LogData>[],
      rolls: rollQ.records as Rec<RollData>[],
      mine: characters.find((c) => c.data.userId === userId) ?? null,
      online,
      typing,
      setTyping: setSelfTyping,
      nameOf,
      ready: gameQ.status === 'ready' && charQ.status === 'ready',
    }
  }, [gameQ.records, gameQ.status, charQ.records, charQ.status, enemyQ.records, logQ.records, rollQ.records, peers, tableId, table, userId, nameOf])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** Seconds left until a server deadline (ms epoch), ticking every 250 ms. */
export function useCountdown(deadlineAt: number | undefined): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!deadlineAt) return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [deadlineAt])
  if (!deadlineAt) return 0
  return Math.max(0, Math.ceil((deadlineAt - now) / 1000))
}

export const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
