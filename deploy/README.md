# Self-hosted deployment

The production frontend and editor are served as one atomic static release by nginx:

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

1. Build and validate a composite release containing the Mini App at `/` and
   the editor at `/editor/`.
2. Copy the composite directory to a release directory named after both Git commits.
3. Point `/opt/audio2midi-web/current` at that release.
4. Install `deploy/nginx/app.audio2midi.ru.bootstrap.conf`.
5. Point the `app` and `miniapp` DNS records at the VPS.
6. Issue one certificate covering both names.
7. Replace the bootstrap nginx file with
   `deploy/nginx/app.audio2midi.ru.conf`.

Always run `nginx -t` before reloading nginx.

Build the release locally with:

```bash
./scripts/build_composite_release.sh \
  /path/to/audio2midi-editor \
  /tmp/audio2midi-web-release
```

Never activate a directory that has not passed
`scripts/validate_composite_release.sh`. This prevents an ordinary Mini App
deployment from silently deleting `/editor/`.

The `www` redirect is installed independently from
`deploy/nginx/www.audio2midi.ru.conf` and uses its own Let's Encrypt
certificate.

## Release validation

```bash
curl -fsS https://app.audio2midi.ru/health
curl -fsS https://miniapp.audio2midi.ru/health
curl -fsS https://app.audio2midi.ru/ | grep -q '/assets/index-'
curl -fsS https://app.audio2midi.ru/editor/00000000-0000-0000-0000-000000000000 | grep -q '/editor/'
```

Validate a real `?file=` URL without printing its presigned S3 credentials in
logs or shell history.

## Web Studio

Authenticated users can now create and follow projects at:

```text
https://app.audio2midi.ru/new
https://app.audio2midi.ru/tracks/<project-id>
```

By default audio is uploaded through the authenticated web API and immediately
written to private S3. This avoids depending on bucket-level CORS permissions.
Set `WEB_DIRECT_S3_UPLOAD=true` only after the bucket CORS policy allows `PUT`
from `https://app.audio2midi.ru` and `https://miniapp.audio2midi.ru`, including
the `content-type` and `x-amz-meta-sha256` request headers.

The browser then submits only the verified object manifest to the account API.
The project page polls durable job state and exposes account-owned artifacts
through the existing short-lived download redirects.

## Internal Listening Lab

The internal blind A/B viewer is served from:

```text
https://app.audio2midi.ru/research/listening
```

The review UI keeps both piano rolls visible, supports full-screen inspection,
and obtains composition selection, previous/next navigation and progress from
the protected research API.

It is intentionally absent from public navigation. Before enabling the route:

1. Create `/etc/nginx/audio2midi-research.htpasswd`.
2. Create `/etc/nginx/snippets/audio2midi-research-gateway.conf` containing a
   `proxy_set_header X-Research-Gateway "<random secret>";` directive.
3. Put the same value in `RESEARCH_GATEWAY_SECRET` for `audio2midi-web-api`.
4. Set `RESEARCH_ASSET_ROOT` to the read-only gallery export root.
5. Apply `20260727_research_listening_lab_v1.sql` and import a sanitized
   listening-gallery manifest.

The ordinary `/api/` route explicitly clears the research gateway headers, so
public clients cannot turn an account API request into research-admin access.

## Rollback

Atomically repoint `/opt/audio2midi-web/current` to the previous release,
validate nginx, and reload it. The bot's `VISUALIZER_BASE_URL` can independently
be restored to `https://audio2midi.ru/visualizer` if the new frontend must be
removed from the user path.
