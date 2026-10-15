#!/usr/bin/env bash
# Applies the shim and every migration (each twice, to prove they are safe to
# re-run) to a throwaway local Postgres, then runs every *.test.sql. Needs the
# Postgres 16 server binaries and a non-root user. Output is read by eye: each
# test step echoes what it expects.
#
#   bash supabase/tests/run.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
export PATH="/usr/lib/postgresql/16/bin:$PATH"
work="$(mktemp -d)"
trap 'pg_ctl -D "$work/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$work"' EXIT
initdb -D "$work/data" -U postgres -A trust >/dev/null
pg_ctl -D "$work/data" -o "-k $work -p 54329 -c listen_addresses=''" -l "$work/log" -w start >/dev/null
psql=(psql -h "$work" -p 54329 -U postgres -X -q)
"${psql[@]}" -c 'create database t'
"${psql[@]}" -d t -v ON_ERROR_STOP=1 -f "$here/shim.sql"
for m in "$here"/../migrations/*.sql; do
  echo "=== $(basename "$m")"
  "${psql[@]}" -d t -v ON_ERROR_STOP=1 -f "$m"
  "${psql[@]}" -d t -v ON_ERROR_STOP=1 -f "$m"
done
for t in "$here"/*.test.sql; do
  echo "=== $(basename "$t")"
  "${psql[@]}" -d t -f "$t" 2>&1 || true
done
