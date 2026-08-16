#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
editor_root="${1:?usage: build_composite_release.sh EDITOR_REPO OUTPUT_DIR}"
output_dir="${2:?usage: build_composite_release.sh EDITOR_REPO OUTPUT_DIR}"

editor_root="$(cd "$editor_root" && pwd)"
case "$output_dir" in
  ""|"/"|"$HOME") echo "unsafe output directory" >&2; exit 2 ;;
esac
if test -e "$output_dir"; then
  echo "output directory already exists: $output_dir" >&2
  exit 2
fi

npm --prefix "$repo_root/frontend" ci
npm --prefix "$repo_root/frontend" run build
npm --prefix "$editor_root" ci
npm --prefix "$editor_root" run build

stage_dir="$(mktemp -d "${TMPDIR:-/tmp}/audio2midi-web-release.XXXXXX")"
trap 'rm -rf "$stage_dir"' EXIT

cp -R "$repo_root/frontend/dist/." "$stage_dir/"
mkdir -p "$stage_dir/editor"
cp -R "$editor_root/dist/." "$stage_dir/editor/"

miniapp_sha="$(git -C "$repo_root" rev-parse HEAD)"
editor_sha="$(git -C "$editor_root" rev-parse HEAD)"
generated_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
printf '{\n  "schema_version": 1,\n  "generated_at": "%s",\n  "miniapp_commit": "%s",\n  "editor_commit": "%s"\n}\n' \
  "$generated_at" "$miniapp_sha" "$editor_sha" > "$stage_dir/release-manifest.json"

(cd "$stage_dir" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 shasum -a 256 > SHA256SUMS)
"$repo_root/scripts/validate_composite_release.sh" "$stage_dir"

mkdir -p "$(dirname "$output_dir")"
mv "$stage_dir" "$output_dir"
trap - EXIT
echo "$output_dir"
