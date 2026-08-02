#!/bin/sh
# Verify the two vendored copies of the Decrypto substrate are byte-identical.
# Usage: scripts/substrate-parity.sh [path-to-the-table-handoff]
set -e
HERE="$(cd "$(dirname "$0")/.." && pwd)"
TABLE="${1:-$HERE/../the-table-handoff}"
A="$HERE/shared/substrate"
B="$TABLE/lib/decrypto-substrate/src"
if [ ! -d "$B" ]; then
  echo "the-table substrate copy not found at $B" >&2
  exit 2
fi
status=0
for f in "$A"/*.ts; do
  name="$(basename "$f")"
  if ! cmp -s "$f" "$B/$name"; then
    echo "MISMATCH: $name"
    status=1
  fi
done
for f in "$B"/*.ts; do
  name="$(basename "$f")"
  [ -f "$A/$name" ] || { echo "EXTRA IN TABLE COPY: $name"; status=1; }
done
if [ "$status" -eq 0 ]; then
  echo "substrate parity OK ($(ls "$A"/*.ts | wc -l | tr -d ' ') files)"
else
  echo "substrate parity FAILED — sync both copies in the same change" >&2
fi
exit "$status"
