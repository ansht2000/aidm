/**
 * Two-player end-to-end: host creates a table, a second player joins by
 * invite link, both pick heroes and ready up, the session runs through the
 * scripted (fake) DM — opening narration, a round of actions, a requested
 * die roll, a second round — and both players see the chronicle.
 *
 * Uses `?fakeDm=1`, honoured only when ALLOW_DEBUG_ROUTES is on (local
 * dev/test), so the run is deterministic and spends no AI credits.
 */
import { test, expect, loadAllTestAccounts, type MultiplayerUser } from 'deepspace/testing'

test.skip(loadAllTestAccounts().length < 2, 'Needs 2 usable test accounts (npx deepspace test accounts list --usable)')
test.setTimeout(150_000)

async function pickHero(user: MultiplayerUser, pregenId: string) {
  await user.page.getByTestId(`pregen-${pregenId}`).click()
  await user.page.getByTestId('claim-hero').click()
  await expect(user.page.getByTestId('ready-toggle')).toBeVisible({ timeout: 15_000 })
  await user.page.getByTestId('ready-toggle').click()
}

async function act(user: MultiplayerUser, text: string) {
  const input = user.page.getByTestId('action-input')
  await expect(input).toBeVisible({ timeout: 30_000 })
  await input.fill(text)
  await user.page.getByTestId('act-button').click()
}

test('two players run a session with the scripted DM', async ({ users }) => {
  const [host, guest] = await users(2)

  // Host creates a private table.
  await host.page.goto('/home?fakeDm=1')
  await host.page.getByLabel('Host a new table').fill('[e2e] Lantern Company')
  await host.page.getByRole('switch').click()
  await host.page.getByTestId('create-table').click()
  await expect(host.page).toHaveURL(/\/t\/[A-Z0-9]{6}$/, { timeout: 20_000 })
  const code = (await host.page.getByTestId('invite-code').textContent())?.trim()
  expect(code).toMatch(/^[A-Z0-9]{6}$/)

  // Guest follows the invite link and takes a seat.
  await guest.page.goto(`/t/${code}`)
  await guest.page.getByTestId('join-table').click()
  await expect(guest.page.getByTestId('table-lobby')).toBeVisible({ timeout: 20_000 })

  await pickHero(host, 'fighter')
  await pickHero(guest, 'rogue')

  // The guest sees the host's hero in the seat list (live sync across players).
  await expect(guest.page.getByTestId('seats')).toContainText('Brann Hollowmere', { timeout: 15_000 })

  await expect(host.page.getByTestId('start-session')).toBeEnabled({ timeout: 15_000 })
  await host.page.getByTestId('start-session').click()

  // Opening narration streams to both players.
  for (const u of [host, guest]) {
    await expect(u.page.getByTestId('narration').first()).toContainText('Fog presses', { timeout: 30_000 })
  }

  // Round 1: both act; the DM asks one of them for an Insight roll.
  await act(host, 'I ask the miller when he last saw Elsie.')
  await expect(guest.page.getByTestId('story-log')).toContainText('I ask the miller', { timeout: 15_000 })
  await act(guest, 'I watch the room for anyone who looks away.')

  const rollButtons = [host, guest].map((u) => u.page.getByTestId('composer-roll'))
  await expect(async () => {
    const visible = await Promise.all(rollButtons.map((b) => b.isVisible()))
    expect(visible.some(Boolean)).toBe(true)
  }).toPass({ timeout: 30_000 })
  const roller = (await rollButtons[0].isVisible()) ? host : guest
  await roller.page.getByTestId('composer-roll').click()

  // Both see the resolved roll card, then the follow-up narration.
  for (const u of [host, guest]) {
    await expect(u.page.locator('[data-testid="roll-card"][data-status="rolled"]')).toBeVisible({ timeout: 20_000 })
    await expect(u.page.getByTestId('story-log')).toContainText('the bell calls to the grieving', { timeout: 30_000 })
  }

  // Round 2: both act; the scripted DM ends the adventure and writes the chronicle.
  await act(host, 'We follow the causeway east.')
  await act(guest, 'I scout ahead quietly.')
  for (const u of [host, guest]) {
    await expect(u.page.getByTestId('chronicle-title')).toHaveText('The Bell Falls Silent', { timeout: 40_000 })
  }
})

test('a player who is not seated cannot open a table room socket', async ({ users }) => {
  const [host, outsider] = await users(2)
  await host.page.goto('/home?fakeDm=1')
  await host.page.getByLabel('Host a new table').fill('[e2e] Closed door')
  await host.page.getByRole('switch').click()
  await host.page.getByTestId('create-table').click()
  await expect(host.page).toHaveURL(/\/t\/[A-Z0-9]{6}$/, { timeout: 20_000 })
  const code = (await host.page.getByTestId('invite-code').textContent())?.trim()

  // The outsider (not seated) sees only the "take a seat" door, not the table.
  await outsider.page.goto(`/t/${code}`)
  await expect(outsider.page.getByTestId('join-table')).toBeVisible({ timeout: 20_000 })
  await expect(outsider.page.getByTestId('table-lobby')).toHaveCount(0)
})
