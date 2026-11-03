#!/usr/bin/env bash
# Pilha B: uma segunda pilha Supabase local, enxuta, ao lado da pilha A (`azkaban`, portas 544xx).
# Muda só a cópia de trabalho de supabase/config.toml (project_id `azkaban-b`, portas 545xx, inspetor
# 8283, sem Studio), com skip-worktree para nunca entrar num commit.
#
#   bash docs/agentes/ferramentas/pilha-b.sh db         só o Postgres (~60 MB): db:test, db reset, db:types
#   bash docs/agentes/ferramentas/pilha-b.sh funcoes    Postgres, Auth, REST, Storage, Kong e Edge Runtime (~0,85 GB)
#   bash docs/agentes/ferramentas/pilha-b.sh run <cmd>  roda <cmd> apontado para a B (ex.: run pnpm functions:test)
#   bash docs/agentes/ferramentas/pilha-b.sh parar      para a B e devolve o config.toml original
#
# Regras:
# - Uma pilha B por vez na máquina, de um checkout só; o script recusa subir uma segunda.
# - E2E e `pnpm dev` só na pilha A: a porta 8091, o e-mail 54424 e o .env.development.local do app são da A.
# - `db` pode rodar durante uma E2E da A; `funcoes` não (a máquina tem 15 GB).
# - Nunca `supabase stop --all`, nunca `docker stop` genérico: só `parar`.
# - Rode `parar` antes de um merge que toque o config.toml.
set -e
cfg=supabase/config.toml
b_env() {
  export SUPABASE_URL=http://127.0.0.1:54521 DB_CONTAINER=supabase_db_azkaban-b COMPOSE_PROJECT=azkaban-b
}
ligar() {
  # Uma pilha B por máquina: dois checkouts com `azkaban-b` dividiriam os mesmos contêineres.
  if docker ps --format '{{.Names}}' | grep -q '_azkaban-b$'; then
    echo "a pilha B já está de pé (outro checkout?); use a A ou espere" >&2
    exit 1
  fi
  if grep -q '^project_id = "azkaban-b"$' "$cfg"; then return; fi
  git diff --quiet -- "$cfg" || { echo "$cfg tem mudanças locais; pare" >&2; exit 1; }
  sed -i -E \
    -e 's/^project_id = "azkaban"$/project_id = "azkaban-b"/' \
    -e 's/^(port|shadow_port) = 544([0-9]{2})$/\1 = 545\2/' \
    -e 's/^inspector_port = 8183$/inspector_port = 8283/' \
    -e '/^\[studio\]/,/^\[/ s/^enabled = true$/enabled = false/' \
    "$cfg"
  git update-index --skip-worktree "$cfg"
  grep -q '^project_id = "azkaban-b"$' "$cfg" || { echo "config.toml não mudou; pare" >&2; exit 1; }
}
case "$1" in
  db)
    ligar
    pnpm exec supabase start -x gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
    ;;
  funcoes)
    ligar
    pnpm exec supabase start -x realtime,imgproxy,mailpit,postgres-meta,studio,logflare,vector,supavisor
    ;;
  run)
    shift
    grep -q '^project_id = "azkaban-b"$' "$cfg" || { echo "pilha B não está ligada neste checkout" >&2; exit 1; }
    b_env
    "$@"
    ;;
  parar)
    if grep -q '^project_id = "azkaban-b"$' "$cfg"; then pnpm exec supabase stop; fi
    git update-index --no-skip-worktree "$cfg"
    git checkout -- "$cfg"
    echo "pilha B parada e desfeita"
    ;;
  *)
    sed -n 2,18p "$0"
    exit 1
    ;;
esac
