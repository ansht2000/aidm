/**
 * Live DM smoke (opt-in, spends real AI credits): one player runs a few turns
 * against the real model to check latency, tool use, and the UI end to end.
 *
 *   LIVE_DM=1 SHOT_DIR=/tmp/shots npx deepspace test run all --grep "live DM"
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'

test.skip(!process.env.LIVE_DM || loadAllTestAccounts().length < 1, 'Opt-in: set LIVE_DM=1')
test.setTimeout(420_000)

const shot = async (page: import('@playwright/test').Page, name: string) => {
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/${name}.png`, fullPage: false })
}

test('live DM runs real turns', async ({ users }) => {
  const [p] = await users(1)
  const { page } = p
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/home')
  await shot(page, '01-home')
  await page.getByLabel('Host a new table').fill('[live] Solo test')
  await page.getByTestId('create-table').click()
  await expect(page).toHaveURL(/\/t\/[A-Z0-9]{6}$/, { timeout: 20_000 })
  await page.getByTestId('pregen-cleric').click()
  await shot(page, '02-lobby')
  await page.getByTestId('claim-hero').click()
  await page.getByTestId('ready-toggle').click()
  await page.getByTestId('start-session').click()

  const waitForPlayer = async (label: string, before = 0) => {
    const t0 = Date.now()
    await expect(page.getByTestId('narration').first()).toBeVisible({ timeout: 120_000 })
    // Wait for the DM to have written something new, then for control to return.
    await expect(async () => expect(await page.getByTestId('narration').count()).toBeGreaterThan(before)).toPass({ timeout: 150_000 })
    await expect(page.getByTestId('dm-status')).toHaveCount(0, { timeout: 150_000 })
    await expect(async () => {
      const inputVisible = await page.getByTestId('action-input').isVisible()
      const rollVisible = await page.getByTestId('composer-roll').isVisible()
      const ended = await page.getByTestId('chronicle').isVisible()
      expect(inputVisible || rollVisible || ended).toBe(true)
    }).toPass({ timeout: 150_000 })
    console.log(`[live] ${label}: ${Date.now() - t0} ms`)
  }

  await waitForPlayer('opening')
  await shot(page, '03-opening')

  const actions = [
    'I ask Marta and Old Fennick what they know about the chapel and the words over its crypt.',
    'I put a steady hand on the miller and ask him exactly when and where Elsie was last seen.',
    'I lead us out along the causeway toward the chapel, lantern held high.',
    'I raise my holy symbol and press on through the fog, warhammer ready.',
  ]
  for (const [i, text] of actions.entries()) {
    if (await page.getByTestId('composer-roll').isVisible()) {
      const before = await page.getByTestId('narration').count()
      await page.getByTestId('composer-roll').click()
      await waitForPlayer(`roll ${i}`, before)
      await shot(page, `04-roll-${i}`)
    }
    if (await page.getByTestId('chronicle').isVisible()) break
    if (await page.getByTestId('action-input').isVisible()) {
      const before = await page.getByTestId('narration').count()
      await page.getByTestId('action-input').fill(text)
      await page.getByTestId('act-button').click()
      await waitForPlayer(`turn ${i}`, before)
      await shot(page, `05-turn-${i}`)
    }
  }
  if (!(await page.getByTestId('chronicle').isVisible())) {
    await page.getByRole('button', { name: 'End session' }).click()
    await page.getByRole('button', { name: 'End and write the chronicle' }).click()
  }
  const t0 = Date.now()
  await expect(page.getByTestId('chronicle-title')).toBeVisible({ timeout: 150_000 })
  console.log(`[live] recap: ${Date.now() - t0} ms, title: ${await page.getByTestId('chronicle-title').textContent()}`)
  await shot(page, '06-chronicle')
  const texts = await page.getByTestId('story-log').innerText()
  console.log(`[live] story so far:\n${texts.slice(0, 4000)}`)
})
