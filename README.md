# Inkbound

An AI Dungeon Master that runs a ~25-minute 5e-compatible adventure for 1–5 players, live in the browser. Built on [DeepSpace](https://docs.deep.space).

**See the [writeup](WRITEUP.md) for extra details about what I built, tradeoffs, and what I'd do next.** 

**Live app:** https://aidm.app.space

## Develop

```sh
nvm use                      # Node 26 (see .nvmrc); npm >= 11.6
npm install
npx deepspace auth login
npx deepspace dev start      # local app + Durable Objects
npx deepspace test run all   # 13 specs; needs 2 test accounts (npx deepspace test accounts list --usable)
npx deepspace deploy
```

Opt-in specs that call the real model (spend a few cents of AI credits):

```sh
LIVE_DM=1 npx deepspace test run all --grep "live"
DEPLOYED_URL=https://aidm.app.space npx playwright test -c tests/playwright.deployed.config.ts
```

Local tables can use a scripted DM: open `/home?fakeDm=1` (ignored in production).

