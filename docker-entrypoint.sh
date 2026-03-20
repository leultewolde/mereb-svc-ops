#!/bin/sh
set -euo pipefail

run_prisma_migrations() {
  set +e
  output="$(pnpm prisma migrate deploy 2>&1)"
  status=$?
  set -e

  printf '%s\n' "$output"

  if [ "$status" -eq 0 ]; then
    return 0
  fi

  if [ "${PRISMA_BASELINE_ON_P3005:-0}" != "1" ]; then
    return "$status"
  fi

  if ! printf '%s' "$output" | grep -q "Error: P3005"; then
    return "$status"
  fi

  if [ -z "${PRISMA_BASELINE_MIGRATION:-}" ]; then
    echo "[entrypoint] PRISMA_BASELINE_ON_P3005 is enabled but PRISMA_BASELINE_MIGRATION is not set." >&2
    return "$status"
  fi

  echo "[entrypoint] Existing non-empty schema detected with no Prisma migration history. Attempting one-time baseline for ${PRISMA_BASELINE_MIGRATION}."
  pnpm prisma db push --skip-generate

  set +e
  resolve_output="$(pnpm prisma migrate resolve --applied "${PRISMA_BASELINE_MIGRATION}" 2>&1)"
  resolve_status=$?
  set -e
  printf '%s\n' "$resolve_output"

  if [ "$resolve_status" -ne 0 ]; then
    echo "[entrypoint] prisma migrate resolve did not succeed; retrying deploy in case another pod already recorded the baseline." >&2
  fi

  pnpm prisma migrate deploy
}

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[entrypoint] ERROR: DATABASE_URL is not set; cannot start svc-ops." >&2
  exit 1
fi

if [ "${SKIP_PRISMA_MIGRATE:-0}" != "1" ]; then
  echo "[entrypoint] Running prisma migrate deploy..."
  run_prisma_migrations
else
  echo "[entrypoint] Skipping prisma migrate deploy (SKIP_PRISMA_MIGRATE=1)"
fi

exec node dist/index.js
