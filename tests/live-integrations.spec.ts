/**
 * Live integration smoke (opt-in, spends real credits, sends one email):
 * a solo session with the scripted DM reaches the chronicle, then the player
 * has it read aloud (ElevenLabs) and emailed to their own address (DeepSpace
 * email). Asserts on the action responses, since headless audio is silent.
 *
 *   LIVE_DM=1 npx deepspace test run all --grep "live integrations"
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'

test.skip(!process.env.LIVE_DM || loadAllTestAccounts().length < 1, 'Opt-in: set LIVE_DM=1')
test.setTimeout(180_000)

test('live integrations: read aloud and email the chronicle', async ({ users }) => {
  const [p] = await users(1)
  const { page } = p
  await page.goto('/home?fakeDm=1')
  await page.getByLabel('Host a new table').fill('[live] Integrations')
  await page.getByTestId('create-table').click()
  await expect(page).toHaveURL(/\/t\/[A-Z0-9]{6}$/, { timeout: 20_000 })
  await page.getByTestId('pregen-bard').click()
  await page.getByTestId('claim-hero').click()
  await page.getByTestId('ready-toggle').click()
  await expect(page.getByTestId('start-session')).toBeEnabled({ timeout: 15_000 })
  await page.getByTestId('start-session').click()

  const act = async (text: string) => {
    await expect(page.getByTestId('action-input')).toBeVisible({ timeout: 30_000 })
    await page.getByTestId('action-input').fill(text)
    await page.getByTestId('act-button').click()
  }

  // Read the opening passage aloud mid-session.
  await expect(page.getByTestId('narration').first()).toContainText('Fog presses', { timeout: 30_000 })
  const story = page.getByTestId('story-log').getByTestId('read-aloud')
  await expect(story).toBeVisible({ timeout: 15_000 })
  const [voice] = await Promise.all([page.waitForResponse((r) => r.url().includes('/api/actions/readAloud')), story.click()])
  const v = await voice.json()
  expect(v.success, v.error).toBe(true)
  expect(v.data.audioUrl).toMatch(/^data:audio\//)
  console.log(`[live] read aloud ok: ${v.data.chars} chars, ${Math.round(v.data.audioUrl.length / 1024)} KB audio`)

  await act('I ask the miller when he last saw Elsie.')
  await expect(page.getByTestId('composer-roll')).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('composer-roll').click()
  await act('We follow the causeway east.')
  await expect(page.getByTestId('chronicle-title')).toHaveText('The Bell Falls Silent', { timeout: 40_000 })

  const [mail] = await Promise.all([page.waitForResponse((r) => r.url().includes('/api/actions/emailChronicle')), page.getByTestId('email-chronicle').click()])
  const m = await mail.json()
  expect(m.success, m.error).toBe(true)
  await expect(page.getByTestId('email-chronicle')).toContainText('Sent to')
  console.log(`[live] email ok: sent to ${m.data.sentTo}`)
})
