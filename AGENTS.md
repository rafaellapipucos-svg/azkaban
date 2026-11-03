# Instruções para agentes de IA

Este arquivo é a convenção lida automaticamente por ferramentas como o Codex. As regras são as mesmas para qualquer IA e estão em [CLAUDE.md](CLAUDE.md): comandos, regras de arquitetura e a regra obrigatória do log.

Resumo do que não pode faltar:

1. Leia `CLAUDE.md`, o cabeçalho e as últimas 10 entradas de `LOG_DE_ALTERACOES.md`, `AGENTES.md`, `docs/arquitetura.md` e `docs/adr/` antes de alterar qualquer coisa.
2. Ao terminar cada bloco de trabalho, adicione uma entrada no final de `LOG_DE_ALTERACOES.md`, com o nome da sua IA e o da pessoa.
3. Respeite as fronteiras entre módulos; rode `pnpm check` antes de commitar.
4. Nunca commite segredos: o repositório é público.
