/**
 * A table: /t/:code. Resolves the invite code to a table, lets a signed-in
 * visitor take a seat, then mounts that table's own RecordRoom
 * (`table:<tableId>`) and renders the phase-appropriate screen.
 */

import { useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { RecordScope, useAuth, useQuery, useUserLookup } from 'deepspace'
import { Button, buttonVariants } from '@/components/ui'
import { useAction } from '@/lib/actions'
import { tableRoomSchemas } from '@/schemas'
import { MAX_SEATS, type TableData } from '@/game/types'
import { Chronicle } from '@/components/game/Chronicle'
import { PlayScreen } from '@/components/game/PlayScreen'
import { TableLobby } from '@/components/game/TableLobby'
import { TableProvider, useTable } from '@/components/game/TableContext'

function PhaseRouter() {
  const { game, ready } = useTable()
  if (!ready || !game) {
    return <div className="flex h-full items-center justify-center font-display text-lg italic text-muted-foreground">Opening the book…</div>
  }
  if (game.phase === 'lobby') return <TableLobby />
  if (game.phase === 'ended') return <Chronicle />
  return <PlayScreen />
}

function Notice({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-20 text-center">
      <h1 className="font-display text-3xl">{title}</h1>
      {children}
    </div>
  )
}

export default function TablePage() {
  const { code = '' } = useParams()
  const upper = code.toUpperCase()
  const { userId } = useAuth()
  const { records, status } = useQuery<TableData>('tables', { where: { code: upper }, limit: 1 })
  const { run, pending } = useAction()
  const { getName } = useUserLookup()
  const nameOf = useCallback((id: string) => getName(id) ?? 'Adventurer', [getName])
  const table = records[0]

  if (status === 'loading' || !userId) {
    return <div className="flex h-full items-center justify-center font-display text-lg italic text-muted-foreground">Finding the table…</div>
  }

  const seated = table?.data.playerIds.includes(userId)

  if (!table || !seated) {
    const full = table && table.data.playerIds.length >= MAX_SEATS
    const started = table && table.data.status !== 'lobby'
    return (
      <Notice title={table ? table.data.name : 'You have an invitation'}>
        <p className="text-muted-foreground">
          {table
            ? `${table.data.moduleTitle} · hosted by ${table.data.hostName} · ${table.data.playerIds.length}/${MAX_SEATS} seats`
            : `Invite code ${upper}. Take a seat to see the table.`}
        </p>
        {started ? (
          <p className="text-sm text-muted-foreground">This session has already begun.</p>
        ) : full ? (
          <p className="text-sm text-muted-foreground">Every seat is taken.</p>
        ) : (
          <Button
            data-testid="join-table"
            size="lg"
            loading={pending === 'joinTable'}
            onClick={async () => {
              const out = await run('joinTable', { code: upper })
              // A private table only becomes visible once you are seated; if the
              // live query has not picked it up shortly, reload to resubscribe.
              if (out.success && !table) setTimeout(() => window.location.reload(), 1200)
            }}
          >
            Take a seat
          </Button>
        )}
        <Link to="/home" className={buttonVariants({ variant: 'ghost' })}>
          Back to the tavern board
        </Link>
      </Notice>
    )
  }

  return (
    <RecordScope roomId={`table:${table.recordId}`} schemas={tableRoomSchemas}>
      <TableProvider tableId={table.recordId} table={table} userId={userId} nameOf={nameOf}>
        <PhaseRouter />
      </TableProvider>
    </RecordScope>
  )
}
