# Self-hosted deployment

The production frontend is served as static files by nginx:

- canonical URL: `https://app.audio2midi.ru`
- compatibility URL: `https://miniapp.audio2midi.ru`
- `https://www.audio2midi.ru` permanently redirects to the legacy canonical
  landing page at `https://audio2midi.ru`
- release root: `/opt/audio2midi-web/releases/<git-sha>`
- active symlink: `/opt/audio2midi-web/current`

The legacy `https://audio2midi.ru/visualizer` deployment is not modified by
this release and remains available as a rollback target while the new frontend
is being validated.

## First installation

1. Build and validate `frontend/dist`.
2. Copy it to a release directory named after the Git commit.
3. Point `/opt/audio2midi-web/current` at that release.
4. Install `deploy/nginx/app.audio2midi.ru.bootstrap.conf`.
5. Point the `app` and `miniapp` DNS records at the VPS.
6. Issue one certificate covering both names.
7. Replace the bootstrap nginx file with
   `deploy/nginx/app.audio2midi.ru.conf`.

Always run `nginx -t` before reloading nginx.

The `www` redirect is installed independently from
`deploy/nginx/www.audio2midi.ru.conf` and uses its own Let's Encrypt
certificate.

## Release validation

```bash
curl -fsS https://app.audio2midi.ru/health
curl -fsS https://miniapp.audio2midi.ru/health
curl -fsS https://app.audio2midi.ru/ | grep -q '/assets/index-'
```

Validate a real `?file=` URL without printing its presigned S3 credentials in
logs or shell history.

## Rollback

Atomically repoint `/opt/audio2midi-web/current` to the previous release,
validate nginx, and reload it. The bot's `VISUALIZER_BASE_URL` can independently
be restored to `https://audio2midi.ru/visualizer` if the new frontend must be
removed from the user path.
