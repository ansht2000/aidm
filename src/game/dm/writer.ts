/**
 * Streams DM narration into the table's `log` so every player sees it type
 * out live. Narration is split into segments at each tool call, so dice
 * results appear in the feed exactly where they happened in the story.
 *
 * All operations run on one serial chain: the model's text stream and tool
 * executions can interleave without racing on the current segment.
 */

import type { RoomTools } from '../../server/rooms'
import { addLog } from '../engine'
import type { LogData } from '../types'

const FLUSH_MS = 220

export class NarrationWriter {
  private chain: Promise<unknown> = Promise.resolve()
  private current: { id: string; text: string } | null = null
  private lastFlush = 0
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  /** Every narration segment written this turn (for the recap and debugging). */
  readonly segments: string[] = []

  constructor(
    private readonly tools: RoomTools,
    private readonly round: number,
  ) {}

  private run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(fn, fn)
    this.chain = next.catch(() => undefined)
    return next
  }

  text(delta: string): Promise<void> {
    return this.run(async () => {
      if (!this.current) {
        const trimmed = delta.replace(/^\s+/, '')
        if (!trimmed) return
        const id = await addLog(this.tools, { kind: 'narration', text: trimmed, streaming: true, round: this.round })
        this.current = { id, text: trimmed }
        this.lastFlush = Date.now()
        return
      }
      this.current.text += delta
      if (Date.now() - this.lastFlush >= FLUSH_MS) {
        await this.flushNow()
      } else if (!this.flushTimer) {
        this.flushTimer = setTimeout(() => {
          this.flushTimer = null
          void this.run(() => this.flushNow())
        }, FLUSH_MS)
      }
    })
  }

  private async flushNow() {
    if (!this.current) return
    this.lastFlush = Date.now()
    await this.tools.update<LogData>('log', this.current.id, { text: this.current.text })
  }

  /** Close the open narration segment (before a tool writes its own row). */
  closeSegment(): Promise<void> {
    return this.run(async () => {
      if (this.flushTimer) {
        clearTimeout(this.flushTimer)
        this.flushTimer = null
      }
      if (!this.current) return
      const text = this.current.text.trimEnd()
      this.segments.push(text)
      await this.tools.update<LogData>('log', this.current.id, { text, streaming: false })
      this.current = null
    })
  }

  /** Write a non-narration row in order with the stream. */
  note(entry: Partial<LogData> & Pick<LogData, 'kind' | 'text'>): Promise<string> {
    return this.run(async () => {
      if (this.current) {
        const text = this.current.text.trimEnd()
        this.segments.push(text)
        await this.tools.update<LogData>('log', this.current.id, { text, streaming: false })
        this.current = null
      }
      return addLog(this.tools, { round: this.round, ...entry })
    })
  }

  /** Wait for every queued write. */
  async drain(): Promise<void> {
    await this.closeSegment()
    await this.chain
  }
}
