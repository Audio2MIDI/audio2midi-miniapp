# Retired Mini App sources

The standalone MIDI-only `backend/` and `Dockerfile.backend` were removed from
the active tree on 2026-10-29. Account, project, auth and upload routes belong
to `Audio2MIDI/Audio2MIDI/web_api`, not a second server in this repository.

The originals remain in Git at commit `cac5411` and in the workspace's verified
private `legacy-cleanup-20261029/miniapp` backup. They are historical reference,
not a supported way to start the current account UI.

Unused `uploadMidi`, `checkHealth`, `listMidiFiles` helpers and their old response
types were removed. `fetchLatestMidi` and `MidiResponse` are deliberately retained
because Piano Roll still reads existing `?midi=` links. New project workflows
use `api/account.ts`. The compatibility reader has its own regression test.

`frontend/dist` is generated output and is no longer tracked. Both Docker and
the composite-release script build it from source. Run `npm run build` before
Vite preview or browser tests; deploying an old checked-in dist is unsupported.
Environment files, local caches and notebook checkpoints remain ignored.

The production composite release and legacy upstream services were not changed.
See [README.md](README.md) for development and [DEPLOY.md](DEPLOY.md) for release
boundaries.
