# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

What2Eat is a Discord bot that randomly picks a dish for users who can't decide what to eat. The dish catalog is scraped from foodpanda Taiwan. The repo contains **two separate programs** that share `src/types.ts` and `src/config.ts`:

1. **The bot** — [src/main.ts](src/main.ts), a long-running Discord.js process.
2. **The crawler** — [src/getFoodpanda.ts](src/getFoodpanda.ts), a one-shot script (bare IIFE at the bottom) that regenerates the dish catalog. It is **not** wired into any package.json script; run it manually.

## Commands

Package manager is **pnpm** (see `pnpm-lock.yaml`).

- `pnpm dev` — run the bot in dev mode (`NODE_ENV=development ts-node src/main.ts`); uses the test bot/channel IDs from config.
- `pnpm build` — wipe `build/` and compile with `tsc` to `build/`.
- `pnpm format` — Prettier over the repo (also organizes imports via plugin).
- `pnpm pm2` / `pnpm restart` — production process management over `build/main.js`.
- Run the crawler: `ts-node src/getFoodpanda.ts` (or build, then `node build/getFoodpanda.js`).

There is **no test suite and no linter** — Prettier (no semicolons, single quotes) is the only formatting tool.

## Architecture

### Data pipeline (crawler → catalog)

[src/getFoodpanda.ts](src/getFoodpanda.ts) runs in two phases and caches every HTTP response under `raw/` so re-runs skip already-fetched data:

1. `getRestaurantCodes()` — hits the foodpanda listing API once per Taiwan city (city→ID map at the top of the file) → `raw/foodPanda/cityRequest/<city>.json` → aggregates all restaurant codes → `raw/foodPanda/restaurantCodes.json`.
2. `getRestaurantProducts()` — for each code, hits the vendor menu API → `raw/foodPanda/restaurantRequest/<code>.json`, then normalizes to a `RestaurantProps` and writes `data/<code>.json` (one file per restaurant). Restaurants matching `excludeNames` (supermarkets, pharmacies, etc.) are skipped; restaurants with **≤20 products after filtering are dropped**, and a stale `data/<code>.json` is deleted.

[src/filterProductName.ts](src/filterProductName.ts) decides what counts as a real dish name: it strips all ASCII (`[\x00-\x7F]`, leaving only CJK), then rejects names shorter than 2 chars or containing any `bannedWords` entry (menu-noise terms and punctuation). Edit `bannedWords` to tune catalog quality.

The foodpanda API requests carry hardcoded headers (`X-FP-API-KEY`, perseus/session IDs, a `dps-session-id` token). These are stale-able; if the crawler starts 4xx-ing, these are the first thing to refresh.

### The bot (src/main.ts)

- **Catalog loading is lazy by design.** On `ClientReady`, `loadRestaurants()` reads `data/` into `cache.restaurantIds` — **just the filenames/IDs, not contents** (the in-memory `cache.restaurants` map is intentionally commented out). `getRandomProduct()` picks a random ID, reads that single JSON file from disk on demand, and picks a random product, retrying up to 5× on empty/unparseable files. This keeps memory flat across the ~24k restaurant files. A fresh checkout has **no `data/`**, so the bot returns nothing until the crawler has run.
- **Commands** are registered globally on every startup via `REST.put(Routes.applicationCommands(...))`:
  - `/what2eat` (`commandPick`) — the random pick, with a per-guild cooldown (`config.APP.COOLDOWN_TIME`); `OWNER_ID` bypasses it.
  - `/help` (`commandHelp`) — manual + support-server links.
  - `report` — a **message context-menu** command (`commandReport`), not a slash command; pins the matching log message.
- **Firebase Realtime Database** is the only persistent store:
  - `/banned` — guild/user IDs blocked from the bot; mirrored into `cache.banned` via `child_added/changed/removed` listeners and checked on every interaction.
  - `/logs/<responseMessageId>` — maps a bot reply's message ID → its log message ID so `report` can locate and pin the right log entry.
- Every interaction is mirrored to a Discord log channel (`config.DISCORD.LOGGER_CHANNEL_ID`) by `sendLog`, including latency and guild/channel/user metadata.

### Config & secrets

[src/config.ts](src/config.ts) is **gitignored and holds live credentials** (Discord bot tokens, Firebase service-account private key). Never commit it, paste its contents, or echo its values. `NODE_ENV=development` flips `CLIENT_ID`/`TOKEN`/`LOGGER_CHANNEL_ID` to the test bot. Note that [src/config.ts.example](src/config.ts.example) is **stale** — its shape no longer matches the keys `main.ts` actually reads (`APP.COOLDOWN_TIME`, `DISCORD.{CLIENT_ID,OWNER_ID,...}`); use the real `config.ts` as the reference.

`build/`, `data/`, `raw/`, `tmp/`, and `config.ts` are all gitignored. `raw/uberEats/` is a vestige of a removed UberEats crawler; foodpanda is the only active source.
