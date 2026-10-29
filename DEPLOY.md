# Mini App build and deployment boundaries

## Local development

Use [README.md](README.md) for Vite and Docker development. The default Compose
service is a local frontend on `127.0.0.1:8080`, proxying to the account API from
`Audio2MIDI/Audio2MIDI` on port 8400. The MIDI-only `backend/` and
`Dockerfile.backend` remain legacy sources, not the current account backend.
There is no production deployment command in the local Compose workflow.

## Static build

Use Node.js 22:

```bash
cd frontend
npm ci
npm run test
npm run lint
npm run build
```

`frontend/dist` is the Mini App alone. `/visualizer` and `?file=` can work with a
CORS-enabled MIDI source, but the account, upload and project routes need the
account API behind `/api/`. Serving static files does not supply those APIs.

## Production reference

The production web release combines the Mini App and the signal editor. Follow
[deploy/README.md](deploy/README.md) and the nginx files in `deploy/nginx/`.
Use `scripts/build_composite_release.sh` and
`scripts/validate_composite_release.sh` to build and validate both components.
An ordinary Mini App build must not replace a composite release and remove
`/editor/`. Confirm the actual active release and API runtime before a separately
approved deployment. Local development and local image builds do not activate
or restart production.
