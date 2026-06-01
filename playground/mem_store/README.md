# MemStore Playground

## Quick Start

### Install Dependencies

```bash
cd playground/mem_store
npm install
```

### Run the Server

```bash
npm run dev
```

The MemStore service will start at `http://localhost:3000`.

### Open the Test Client

Open `http://localhost:3000/` in a browser. The pure HTML test client will load and run automated tests automatically on page load.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/cache` | Create a new cache key |
| GET | `/api/cache/:key` | Read a cache key |
| DELETE | `/api/cache/:key` | Delete a cache key |
| POST | `/api/cache/:key/refresh` | Force refresh a cache key |
| PUT | `/api/cache/:key/config` | Update cache config (TTL, cron, warning) |
| GET | `/api/cache/:key/meta` | Read cache metadata |
| POST | `/api/internal/cache/:key` | Internal callback for task engine updates |
| GET | `/api/sse/:key` | Subscribe to SSE events for a key |

## Automated E2E Test

### Prerequisites

Install a local Playwright browser:

```bash
npm install -D playwright
npx playwright install chromium
```

### Run E2E Test

```bash
npx tsx e2e-test.ts
```

The E2E script will launch a headless browser, open the test client page, wait for all automated tests to complete, and report the result.

### Manual Test via Browser

You can also perform manual tests directly on the test client page (`http://localhost:3000/`):

- **Create Cache**: Fill in key, TTL, and initial value, then click `Create / Overwrite`.
- **Create with DAG**: Fill in key, TTL, DAG delay, and DAG return value, then click `Create with DAG (no initial value)`.
- **Read / Delete / Refresh**: Use the Read/Delete/Refresh section with the target key.
- **Update Config**: Modify TTL, Cron, or warning settings for an existing key.
- **SSE Subscription**: Enter a key and click `Subscribe` to watch real-time push events.

## Project Structure

```
playground/mem_store/
├── src/
│   ├── index.ts        # Entry point: starts Hono server
│   ├── server.ts       # Hono app: routes, SSE, CORS
│   ├── memStore.ts     # Cache core: LRU, metadata, refresh logic
│   ├── scheduler.ts    # Cron and pre-expire warning scheduling
│   ├── taskEngine.ts   # Mock task engine adapter
│   └── types.ts        # TypeScript interfaces
├── public/
│   └── index.html      # Pure HTML test client
├── e2e-test.ts         # Playwright E2E automation script
├── package.json
├── tsconfig.json
└── .gitignore
```
