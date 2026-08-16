#!/usr/bin/env bash
set -euo pipefail

release_dir="${1:?usage: validate_composite_release.sh RELEASE_DIR}"
release_dir="$(cd "$release_dir" && pwd)"

test -f "$release_dir/index.html"
test -d "$release_dir/assets"
test -f "$release_dir/editor/index.html"
test -f "$release_dir/release-manifest.json"
test -f "$release_dir/SHA256SUMS"

grep -q '/assets/' "$release_dir/index.html"
grep -q '/editor/' "$release_dir/editor/index.html"
find "$release_dir/assets" -type f -print -quit | grep -q .
find "$release_dir/editor" -maxdepth 1 -type f -name '*.js' -print -quit | grep -q .

(cd "$release_dir" && shasum -a 256 -c SHA256SUMS >/dev/null)
echo "composite release is valid: $release_dir"
