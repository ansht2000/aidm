/**
 * Live smoke on the DEPLOYED app with the real DM (spends a few cents):
 * two signed-in players, invite link, heroes, ready, start, one round, end,
 * chronicle. Skipped unless DEPLOYED_URL is set.
 */
import { test, expect, loadAllTestAccounts, type MultiplayerUser } from 'deepspace/testing'

test.skip(!process.env.DEPLOYED_URL || loadAllTestAccounts().length < 2, 'Set DEPLOYED_URL; needs 2 test accounts')

const narrations = (u: MultiplayerUser) => u.page.getByTestId('narration')

test('deployed: two players play a round with the real DM', async ({ users }) => {
  const [host, guest] = await users(2)
  const shot = async (u: MultiplayerUser, name: string) => {
    if (process.env.SHOT_DIR) await u.page.screenshot({ path: `${process.env.SHOT_DIR}/${name}.png` })
  }
  await host.page.setViewportSize({ width: 1440, height: 900 })
  await guest.page.setViewportSize({ width: 390, height: 844 }) // phone-sized guest

  await host.page.goto('/home')
  await host.page.getByLabel('Host a new table').fill('[smoke] Deployed table')
  await host.page.getByRole('switch').click()
  await host.page.getByTestId('create-table').click()
  await expect(host.page).toHaveURL(/\/t\/[A-Z0-9]{6}$/, { timeout: 30_000 })
  const code = (await host.page.getByTestId('invite-code').textContent())?.trim()

  await guest.page.goto(`/t/${code}`)
  await guest.page.getByTestId('join-table').click()
  await expect(guest.page.getByTestId('table-lobby')).toBeVisible({ timeout: 30_000 })

  for (const [u, hero] of [[host, 'wizard'], [guest, 'ranger']] as const) {
    await u.page.getByTestId(`pregen-${hero}`).click()
    await u.page.getByTestId('claim-hero').click()
    await expect(u.page.getByTestId('ready-toggle')).toBeVisible({ timeout: 20_000 })
    await u.page.getByTestId('ready-toggle').click()
  }
  await expect(host.page.getByTestId('start-session')).toBeEnabled({ timeout: 20_000 })
  await shot(host, 'd-01-lobby')
  await host.page.getByTestId('start-session').click()

  for (const u of [host, guest]) await expect(narrations(u).first()).toBeVisible({ timeout: 90_000 })
  for (const u of [host, guest]) await expect(u.page.getByTestId('action-input')).toBeVisible({ timeout: 90_000 })
  await shot(host, 'd-02-opening-host')
  await shot(guest, 'd-02-opening-guest')

  const before = await narrations(guest).count()
  await host.page.getByTestId('action-input').fill('I study the frightened locals and ask Old Fennick about the chapel bell.')
  await host.page.getByTestId('act-button').click()
  await guest.page.getByTestId('action-input').fill('I slip outside to look for tracks leading toward the marsh.')
  await guest.page.getByTestId('act-button').click()

  // The DM answers the round on both screens.
  for (const u of [host, guest]) {
    await expect(async () => expect(await narrations(u).count()).toBeGreaterThan(before)).toPass({ timeout: 120_000 })
  }
  await expect(host.page.getByTestId('dm-status')).toHaveCount(0, { timeout: 120_000 })
  await shot(host, 'd-03-round-host')
  await shot(guest, 'd-03-round-guest')

  await host.page.getByRole('button', { name: 'End session' }).click()
  await host.page.getByRole('button', { name: 'End and write the chronicle' }).click()
  for (const u of [host, guest]) await expect(u.page.getByTestId('chronicle-title')).toBeVisible({ timeout: 120_000 })
  await shot(host, 'd-04-chronicle')
  console.log(`[deployed] chronicle: ${await host.page.getByTestId('chronicle-title').textContent()}`)

  // The guest has the chronicle read aloud (ElevenLabs); the host emails it to themselves.
  const readBtn = guest.page.getByTestId('chronicle').getByRole('button', { name: 'Read the chronicle aloud' })
  const [voice] = await Promise.all([guest.page.waitForResponse((r) => r.url().includes('/api/actions/readAloud')), readBtn.click()])
  const v = await voice.json()
  expect(v.success, v.error).toBe(true)
  expect(v.data.audioUrl).toMatch(/^data:audio\//)
  console.log(`[deployed] read aloud: ${v.data.chars} chars, ${Math.round(v.data.audioUrl.length / 1024)} KB audio`)
  const [mail] = await Promise.all([host.page.waitForResponse((r) => r.url().includes('/api/actions/emailChronicle')), host.page.getByTestId('email-chronicle').click()])
  const m = await mail.json()
  expect(m.success, m.error).toBe(true)
  await expect(host.page.getByTestId('email-chronicle')).toContainText('Sent to')
  console.log(`[deployed] email sent to ${m.data.sentTo}`)
})

test('deployed: the DM writes a new adventure', async ({ users }) => {
  test.setTimeout(240_000)
  const [, writer] = await users(2)
  await writer.page.goto('/home')
  await writer.page.getByLabel('Host a new table').fill('[smoke] Writer table')
  await writer.page.getByRole('switch').click()
  await writer.page.getByTestId('adventure-generate').click()
  await writer.page.getByTestId('create-table').click()
  await expect(writer.page).toHaveURL(/\/t\/[A-Z0-9]{6}$/, { timeout: 30_000 })
  await expect(writer.page.getByTestId('module-title')).not.toContainText('writing', { timeout: 200_000 })
  console.log(`[deployed] adventure: ${await writer.page.getByTestId('module-title').textContent()}`)
  if (process.env.SHOT_DIR) await writer.page.screenshot({ path: `${process.env.SHOT_DIR}/d-05-writer.png` })
})
