/** End of session: the AI-written chronicle, plus the full story beneath it. */

import { Link } from 'react-router-dom'
import { buttonVariants } from '@/components/ui'
import type { Recap } from '@/game/types'
import { Sigil } from './PartyRail'
import { StoryLog } from './StoryLog'
import { useTable } from './TableContext'

export function Chronicle() {
  const { log, characters, game, table } = useTable()
  const entry = [...log].reverse().find((l) => l.data.kind === 'recap')
  const recap = entry?.data.data as unknown as Recap | undefined
  const writing = !recap

  return (
    <div className="h-full overflow-y-auto" data-testid="chronicle">
      <div className="parchment border-b border-parchment-edge">
        <div className="mx-auto max-w-3xl px-6 py-10 text-center">
          <p className="rubric text-sm">The chronicle of {table.data.name}</p>
          {writing ? (
            <p className="mt-4 narration italic text-ink-soft">{game?.phase === 'ended' ? 'This table ended before the tale began.' : 'The chronicler is setting down the tale…'}</p>
          ) : (
            <>
              <h1 className="mt-2 font-display text-5xl font-semibold text-ink" data-testid="chronicle-title">
                {recap.title}
              </h1>
              <p className="mt-2 rubric text-lg">{recap.outcome === 'victory' ? 'A victory' : recap.outcome === 'defeat' ? 'A defeat' : 'A tale left unfinished'}</p>
              <div className="mt-6 space-y-3 text-left">
                {recap.summary.split(/\n+/).map((p, i) => (
                  <p key={i} className={i === 0 ? 'narration dropcap' : 'narration'}>
                    {p}
                  </p>
                ))}
              </div>
              {recap.highlights.length > 0 && (
                <ul className="mt-6 space-y-2 text-left">
                  {recap.highlights.map((h) => {
                    const c = characters.find((x) => x.recordId === h.characterId)
                    return (
                      <li key={h.characterId} className="flex items-start gap-3">
                        <Sigil name={h.name} sigil={c?.data.sigil ?? 'slate'} className="h-8 w-8 text-base" />
                        <p className="font-serif text-ink">
                          <span className="rubric font-semibold">{h.name}</span> — {h.moment}
                        </p>
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )}
          <Link to="/home" className={buttonVariants({ variant: 'default', className: 'mt-8' })}>
            Back to the tavern board
          </Link>
        </div>
      </div>
      <StoryLog className="overflow-visible" />
    </div>
  )
}
