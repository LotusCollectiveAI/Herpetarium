#!/bin/sh
# Verify the two vendored copies of the Decrypto substrate are byte-identical.
# Usage: scripts/substrate-parity.sh path-to-the-table-checkout
set -e
HERE="$(cd "$(dirname "$0")/.." && pwd)"
if [ "$#" -ne 1 ]; then
  echo "usage: $0 path-to-the-table-checkout" >&2
  echo "an explicit checkout is required so parity cannot target a stale sibling" >&2
  exit 2
fi
TABLE="$(cd "$1" && pwd)"
A="$HERE/shared/substrate"
B="$TABLE/lib/decrypto-substrate/src"
if [ ! -d "$B" ]; then
  echo "the-table substrate copy not found at $B" >&2
  exit 2
fi
status=0
for f in "$A"/*; do
  [ -f "$f" ] || continue
  name="$(basename "$f")"
  if ! cmp -s "$f" "$B/$name"; then
    echo "MISMATCH: $name"
    status=1
  fi
done
for f in "$B"/*; do
  [ -f "$f" ] || continue
  name="$(basename "$f")"
  [ -f "$A/$name" ] || { echo "EXTRA IN TABLE COPY: $name"; status=1; }
done
if [ "$status" -eq 0 ]; then
  echo "substrate parity OK ($(find "$A" -maxdepth 1 -type f | wc -l | tr -d ' ') files)"
else
  echo "substrate parity FAILED — sync both copies in the same change" >&2
fi
exit "$status"
