#!/usr/bin/env bash
# Verificação final de fase: cada passo registra OK/FALHA e segue.
cd "${1:-/c/dev/azkaban}" || exit 1
OUT="${2:-verify.log}"
: > "$OUT"
step() { local name="$1"; shift; local t0=$SECONDS; echo "=== $name" >> "$OUT"; if "$@" >> "$OUT.full" 2>&1; then echo "OK $name ($((SECONDS-t0))s)" >> "$OUT"; else echo "FALHA $name ($((SECONDS-t0))s)" >> "$OUT"; fi; }
: > "$OUT.full"
step install pnpm install --frozen-lockfile
step db:start pnpm db:start
step db:reset pnpm exec supabase db reset
step db:test pnpm db:test
step db:check-permissions pnpm db:check-permissions
step typecheck+test pnpm exec turbo run typecheck test --force
step lint pnpm lint
step boundaries pnpm boundaries
step build:web pnpm build:web
step functions:test pnpm functions:test
step e2e-1 pnpm e2e
step e2e-2 pnpm e2e
step db:test-pos-e2e pnpm db:test
step stop pnpm exec supabase stop
echo FIM >> "$OUT"
