/**
 * Server-action guarantees: auth required, seat checks, and the daily table
 * cap holding under a burst of parallel requests (atomic quota slots).
 */
import { test, expect, loadAllTestAccounts, type MultiplayerUser } from 'deepspace/testing'

test.skip(loadAllTestAccounts().length < 2, 'Needs 2 usable test accounts')

/** Capture the signed-in page's bearer token from its own API traffic. */
async function bearer(u: MultiplayerUser): Promise<string> {
  let token = ''
  u.page.on('request', (r) => {
    const h = r.headers().authorization
    if (!token && h?.startsWith('Bearer ')) token = h.slice(7)
  })
  await u.page.goto('/home')
  await u.page.getByLabel('Host a new table').fill('[api] token probe')
  await u.page.getByTestId('create-table').click()
  await expect(u.page).toHaveURL(/\/t\/[A-Z0-9]{6}$/, { timeout: 20_000 })
  expect(token).not.toBe('')
  return token
}

test('actions require a signed-in caller', async ({ request }) => {
  const res = await request.post('/api/actions/createTable', { data: { name: 'x' } })
  expect(res.status()).toBe(401)
})

test('seat checks and atomic daily cap', async ({ users, request }) => {
  const [a, b] = await users(2)
  const tokenA = await bearer(a)
  const codeA = a.page.url().split('/t/')[1]
  const tokenB = await bearer(b)
  const call = (token: string, name: string, data: Record<string, unknown>) =>
    request.post(`/api/actions/${name}`, { headers: { Authorization: `Bearer ${token}` }, data }).then((r) => r.json())

  // B is not seated at A's table: every game action is refused.
  const joined = await call(tokenA, 'joinTable', { code: codeA })
  const tableId = joined.data.tableId as string
  for (const name of ['submitAction', 'rollDice', 'startGame', 'claimCharacter', 'hostAdvance', 'endGame']) {
    const out = await call(tokenB, name, { tableId, text: 'I steal the gold', rollId: 'x', pregenId: 'rogue' })
    expect(out.success, name).toBe(false)
    expect(out.error, name).toMatch(/not seated/i)
  }

  // Ten parallel createTable calls with the cap enforced: at most 3 succeed today.
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) => call(tokenB, 'createTable', { name: `[api] burst ${i}`, enforceQuota: true })))
  const created = results.filter((r) => r.success).length
  expect(created).toBeLessThanOrEqual(3)
  expect(results.filter((r) => !r.success).every((r) => /3 tables a day/.test(r.error))).toBe(true)
})
