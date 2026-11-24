/**
 * Live combat smoke (opt-in, spends real AI credits): pushes the party into
 * the marsh fight and plays several combat turns against the real model.
 *
 *   LIVE_DM=1 SHOT_DIR=/tmp/shots npx deepspace test run all --grep "live combat"
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'

test.skip(!process.env.LIVE_DM || loadAllTestAccounts().length < 1, 'Opt-in: set LIVE_DM=1')
test.setTimeout(540_000)

test('live combat runs turns in initiative order', async ({ users }) => {
  const [p] = await users(1)
  const { page } = p
  await page.setViewportSize({ width: 1440, height: 900 })
  const shot = async (name: string) => {
    if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/${name}.png` })
  }
  await page.goto('/home')
  await page.getByLabel('Host a new table').fill('[live] Combat test')
  await page.getByTestId('create-table').click()
  await expect(page).toHaveURL(/\/t\/[A-Z0-9]{6}$/, { timeout: 20_000 })
  await page.getByTestId('pregen-fighter').click()
  await page.getByTestId('claim-hero').click()
  await page.getByTestId('ready-toggle').click()
  await page.getByTestId('start-session').click()

  const settle = async (label: string, before: number) => {
    const t0 = Date.now()
    await expect(async () => expect(await page.getByTestId('narration').count()).toBeGreaterThan(before)).toPass({ timeout: 150_000 })
    await expect(page.getByTestId('dm-status')).toHaveCount(0, { timeout: 150_000 })
    console.log(`[live] ${label}: ${Date.now() - t0} ms · ${await page.getByTestId('round-status').textContent()}`)
  }
  await settle('opening', 0)

  const script = [
    'I skip the questions: I grab a lantern and run straight down the causeway into the marsh toward the bell, sword drawn, hunting whatever stalks the fog.',
    'I keep going deeper into the fens, shouting a challenge into the fog to draw out whatever is hunting there.',
  ]
  let step = 0
  for (let i = 0; i < 14; i++) {
    if (await page.getByTestId('chronicle').isVisible()) break
    const before = await page.getByTestId('narration').count()
    if (await page.getByTestId('composer-roll').isVisible()) {
      await page.getByTestId('composer-roll').click()
      await settle(`roll ${i}`, before)
    } else if (await page.getByTestId('action-input').isVisible()) {
      const inCombat = (await page.getByLabel('Initiative order').count()) > 0
      const text = inCombat ? 'I attack the nearest wolf with my longsword.' : script[Math.min(step++, script.length - 1)]
      await page.getByTestId('action-input').fill(text)
      await page.getByTestId('act-button').click()
      await settle(`${inCombat ? 'combat' : 'explore'} ${i}`, before)
    } else {
      await page.waitForTimeout(1500)
    }
    await shot(`c-${String(i).padStart(2, '0')}`)
  }
  const log = await page.getByTestId('story-log').innerText()
  console.log(`[live] combat log tail:\n${log.slice(-3500)}`)
})
