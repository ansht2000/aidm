import { describe, expect, it } from 'vitest'
import { chronicleEmail, speechText } from './share'
import type { Recap } from './types'

describe('speechText', () => {
  it('strips markdown emphasis and joins passages', () => {
    expect(speechText(['The *bell* tolls.', '  Fog   rolls in.  '])).toBe('The bell tolls.\n\nFog rolls in.')
  })

  it('caps long text at a sentence end', () => {
    const long = 'The fog thickens. '.repeat(200)
    const out = speechText([long], 100)
    expect(out.length).toBeLessThanOrEqual(100)
    expect(out.endsWith('.')).toBe(true)
  })
})

describe('chronicleEmail', () => {
  const recap: Recap = {
    title: 'The Bell Falls <Silent>',
    summary: 'The party crossed the marsh.\nThe bell rang no more.',
    outcome: 'victory',
    highlights: [{ characterId: 'c1', name: 'Wren <script>', moment: 'picked the crypt lock' }],
  }
  const mail = chronicleEmail({
    tableName: 'Lantern & Co',
    moduleTitle: 'The Bell Beneath the Marsh',
    recap,
    party: [{ name: 'Wren Ashby', className: 'Rogue' }],
    url: 'https://aidm.app.space/t/ABC123',
  })

  it('escapes player- and model-written text in the HTML', () => {
    expect(mail.html).not.toContain('<script>')
    expect(mail.html).toContain('Wren &lt;script&gt;')
    expect(mail.html).toContain('The Bell Falls &lt;Silent&gt;')
    expect(mail.html).toContain('Lantern &amp; Co')
  })

  it('has a one-line subject and a plain-text body with the link', () => {
    expect(mail.subject).toBe('Your Inkbound chronicle: The Bell Falls <Silent>')
    expect(mail.text).toContain('A victory')
    expect(mail.text).toContain('- Wren <script>: picked the crypt lock')
    expect(mail.text).toContain('https://aidm.app.space/t/ABC123')
  })

  it('keeps a newline in the title out of the subject', () => {
    const m = chronicleEmail({ tableName: 't', moduleTitle: 'm', recap: { ...recap, title: 'A\nB' }, party: [], url: 'u' })
    expect(m.subject).toBe('Your Inkbound chronicle: A B')
  })
})
