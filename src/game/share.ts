/**
 * Turning the story into things that leave the table: the text the narrator
 * voice reads (ElevenLabs), and the chronicle email (DeepSpace email).
 * Pure functions, so they are unit-tested without the platform.
 */

import type { Recap } from './types'

/** Longest passage sent to the narrator voice (billed per character). */
export const MAX_SPEECH_CHARS = 1800

/** Plain text for speech: markdown stripped, whitespace tidied, capped at a sentence end. */
export function speechText(parts: string[], max = MAX_SPEECH_CHARS): string {
  const text = parts
    .map((p) => p.replace(/[*_#`>]+/g, '').replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '), cut.lastIndexOf('."'))
  return (end > max * 0.5 ? cut.slice(0, end + 1) : cut).trim()
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').trim()

export interface ChronicleEmailInput {
  tableName: string
  moduleTitle: string
  recap: Recap
  party: { name: string; className: string }[]
  url: string
}

const OUTCOME: Record<Recap['outcome'], string> = {
  victory: 'A victory',
  defeat: 'A defeat',
  unfinished: 'A tale left unfinished',
}

/** Subject, HTML and plain-text bodies. Every player- or model-written string is escaped. */
export function chronicleEmail({ tableName, moduleTitle, recap, party, url }: ChronicleEmailInput) {
  const subject = oneLine(`Your Inkbound chronicle: ${recap.title}`).slice(0, 150)
  const paragraphs = recap.summary.split(/\n+/).map((p) => p.trim()).filter(Boolean)
  const outcome = OUTCOME[recap.outcome] ?? OUTCOME.unfinished
  const partyLine = party.map((p) => `${p.name} (${p.className})`).join(', ')

  const text = [
    recap.title,
    `${outcome} · ${moduleTitle} · ${tableName}`,
    '',
    ...paragraphs.flatMap((p) => [p, '']),
    ...(recap.highlights.length ? ['Moments to remember:', ...recap.highlights.map((h) => `- ${h.name}: ${h.moment}`), ''] : []),
    partyLine ? `The party: ${partyLine}` : '',
    '',
    `Read the whole tale: ${url}`,
  ].join('\n')

  const serif = "Georgia, 'Times New Roman', serif"
  const html = `<!doctype html><html><body style="margin:0;background:#f3ead7;padding:24px 12px;font-family:${serif};color:#2b2118">
<div style="max-width:560px;margin:0 auto;background:#fbf5e8;border:1px solid #d9c9a3;border-radius:6px;padding:28px 28px 24px">
<p style="margin:0;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#8a2a1f">The chronicle of ${esc(tableName)}</p>
<h1 style="margin:8px 0 4px;font-size:28px;line-height:1.15;font-weight:600">${esc(recap.title)}</h1>
<p style="margin:0 0 18px;color:#8a2a1f;font-style:italic">${esc(outcome)} · ${esc(moduleTitle)}</p>
${paragraphs.map((p) => `<p style="margin:0 0 12px;font-size:17px;line-height:1.55">${esc(p)}</p>`).join('\n')}
${
  recap.highlights.length
    ? `<p style="margin:18px 0 6px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#8a2a1f">Moments to remember</p>
<ul style="margin:0 0 12px;padding-left:20px;font-size:16px;line-height:1.5">${recap.highlights.map((h) => `<li><strong>${esc(h.name)}</strong>: ${esc(h.moment)}</li>`).join('')}</ul>`
    : ''
}
${partyLine ? `<p style="margin:12px 0 0;font-size:14px;color:#5c4b3a">The party: ${esc(partyLine)}</p>` : ''}
<p style="margin:22px 0 0"><a href="${esc(url)}" style="display:inline-block;background:#b8913f;color:#1b140d;text-decoration:none;padding:10px 18px;border-radius:4px;font-family:Arial,sans-serif;font-size:14px">Read the whole tale</a></p>
</div>
<p style="max-width:560px;margin:12px auto 0;font-size:12px;color:#7a6a55;text-align:center;font-family:Arial,sans-serif">You asked Inkbound to send you this chronicle. No further emails will follow.</p>
</body></html>`

  return { subject, text, html }
}
