# Audio2MIDI Mini App

React, TypeScript and Vite client for the Audio2MIDI account, project library,
uploads, processing results and Canvas Piano Roll with Tone.js playback.
The account API is `web_api/app.py` in the separate `Audio2MIDI/Audio2MIDI`
repository. The old MIDI-only server and unused client helpers were retired;
[LEGACY_CLEANUP.md](LEGACY_CLEANUP.md) records recovery commits and the compatibility
reader retained for existing MIDI links. `frontend/dist` is generated, not tracked.

## Local development

Use Node.js 22. The examples assume sibling clones named `Audio2MIDI` and
`audio2midi-miniapp`, as in this workspace. First prepare the account API from
the **Audio2MIDI backend repository**, using a development PostgreSQL database
with its migrations and private S3-compatible development storage:

```bash
cd ../Audio2MIDI
uv sync --python 3.12 --extra dev
# Prepare ignored .env.local with development configuration, then:
WEB_SESSION_SECURE=false WEB_APP_BASE_URL=http://localhost:3000 \
  uv run --env-file .env.local uvicorn web_api.app:app \
  --host 127.0.0.1 --port 8400 --reload
```

Required runtime values include `POSTGRES_DSN`, `S3_ENDPOINT`, `S3_BUCKET`,
`S3_ACCESS_KEY` and `S3_SECRET_KEY`; `S3_REGION` is optional. Set `BOT_TOKEN` for
Telegram auth, or configure the optional email auth provider. See the backend's
`docs/ACCOUNT_CORE.md` and `docs/WEB_ACCOUNT.md` for auth and migration details.
These are server values, never frontend build variables. Disable secure cookies
only for local HTTP. Starting this API does not start GPU workers or the bot;
processing needs a separately configured development worker.

In another terminal:

```bash
cd ../audio2midi-miniapp/frontend
npm ci
npm run dev
```

Open `http://localhost:3000`. Vite strips `/api/` and proxies to
`http://127.0.0.1:8400/`. To use another local API, set the host and port:

```bash
ACCOUNT_API_UPSTREAM=127.0.0.1:18400 npm run dev
```

The frontend repo's `.env` configures Docker Compose. Shell variables configure
the Vite proxy; it does not read the Compose `.env` automatically.
`?dev=1` enables the UI development mode; it does not grant API authentication.
`/visualizer` and `?file=<MIDI URL>` can display MIDI without an account API,
subject to the source server's CORS policy.

## Local Docker frontend

Compose builds the frontend and nginx, then proxies to an account API running
on the host. It does not launch a database, S3, GPU inference or the old API.

```bash
cp .env.example .env
# Start the development account API as above, using port 8400.
docker compose up -d --build frontend
curl --fail http://localhost:8080/health
curl --fail http://localhost:8080/api/health
```

Open `http://localhost:8080`. The first health check is nginx; the second must
reach the account API. Configure the backend's local `WEB_APP_BASE_URL` to this
origin and keep `WEB_SESSION_SECURE=false` for local HTTP. Same-origin proxying
preserves session cookies and avoids browser CORS requirements for the API.

| Compose variable | Default | Meaning |
| --- | --- | --- |
| `LOCAL_PORT` | `8080` | Loopback host port for the frontend |
| `ACCOUNT_API_UPSTREAM` | `host.docker.internal:8400` | HTTP API host and port, without scheme, path or trailing slash |

Docker Desktop forwards `host.docker.internal` to the host. On Linux Engine,
the host-gateway alias resolves the bridge gateway; the host API must listen on
that reachable interface. Use `--host 0.0.0.0` only in an isolated development
environment with firewall rules that keep the API private. Override the upstream
if the API is in another local container/network.

An unavailable upstream produces an API proxy error; `/health` alone is not an
API readiness check. To stop this local frontend, run `docker compose down`.

## API boundary and features

The browser calls `/api/v1/...`; the account API receives `/v1/...`. nginx and
Vite preserve query strings, request bodies, auth headers and session cookies.
The Docker proxy accepts bodies up to 21 MiB, matching the 20 MiB source limit
plus request overhead. Public campaign links `/r/<code>` preserve their path.

The app includes account and billing views, project upload and polling, result
feedback, horizontal/vertical Piano Roll, touch navigation and internal research
views. The old `/api/upload-midi`, `/api/latest-midi` and `/api/list` endpoints
belonged to the retired MIDI-only server; they are not the current project/account contract.

## Checks

```bash
cd frontend
npm run test
npm run lint
npm run build
npm run test:e2e
```

Browser tests use fixtures and the Vite preview server. Install the Playwright
Chromium browser once with `npx playwright install chromium` if it is absent.
For a Docker/nginx integration check with an isolated fake account upstream:

```bash
# From the Mini App repository root:
docker build -f Dockerfile.frontend -t audio2midi-miniapp:local-test .
python3 scripts/test_local_proxy.py audio2midi-miniapp:local-test
```

The proxy check creates a temporary container, sends only synthetic requests and
removes that container afterwards. It never calls production services.
On Linux, pass `--bind <host bridge address>` so the container can reach the
synthetic upstream (CI uses `--bind 0.0.0.0` on its disposable runner).

## Deployment reference

[deploy/README.md](deploy/README.md) describes the separate production static
release: Mini App at `/` and the signal editor at `/editor/`, validated together.
Local Compose contains only the Mini App; editor handoff requires that composite
release. [DEPLOY.md](DEPLOY.md) explains these boundaries. The production URL
is `https://app.audio2midi.ru`; compatibility URL is `https://miniapp.audio2midi.ru`.
The visual reference is the separate `redesign` branch of `Audio2MIDI/WebApp`.
