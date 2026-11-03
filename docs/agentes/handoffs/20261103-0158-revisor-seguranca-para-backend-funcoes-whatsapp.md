# Handoff: revisor-seguranca para backend-funcoes, WhatsApp

**De:** revisor-seguranca
**Para:** backend-funcoes
**Data:** 2026-11-03 01:58 (BRT, derivada de UTC menos 3; o PowerShell foi barrado no worktree)
**Branch:** `chore/security-phase-5`, a partir de `feat/phase-5-whatsapp` (`9f88a68`)

## Contexto

Primeira passada da revisão de segurança da Fase 5. Revisados só os módulos já integrados de `_shared/whatsapp/` (`provider.ts`, `webhook.ts`) e `_shared/secret.ts`. O `WhatsAppChannel`, o `phone-verification` e o `whatsapp-webhook` ficam para a segunda passada.

Resistiu à leitura e aos PoCs em Node: `redirect: 'manual'` e 3xx como `wa_redirect`; o token num campo privado e nenhum erro de `fetch` repassado; a resposta lida até 64 KiB; o log do `ConsoleProvider` só com tipo e template; `validSignature` confere os bytes brutos com `crypto.subtle.verify` (PoC: bytes brutos `true`; o mesmo JSON reserializado, segredo errado e cabeçalho ausente, `false`); `challengeAnswer` com `sameSecret` e o desafio restrito a `[A-Za-z0-9_-]{1,128}` (uma tag HTML no desafio dá `null`, token não configurado dá `null`).

## O que foi entregue

Só este relatório.

## Contratos criados ou alterados

Nenhum.

## O que o destinatário precisa fazer

**SEG5-2, baixa (LGPD e política da Meta). Um PARAR com caractere invisível não para.** `normalizeReply` (`_shared/whatsapp/webhook.ts:53-59`) usa NFD e tira marcas, pontuação e símbolos, mas não a categoria Cf (formato) nem as formas de compatibilidade. PoC em Node, com o módulo real, `isStop` devolve `false` para:

- `PARAR` seguido de U+200B (espaço de largura zero);
- U+200E (marca LTR) seguido de `PARAR`;
- `PARAR` seguido de um emoji composto com ZWJ (U+200D), como o de pessoa com a mão no rosto: o emoji sai, o ZWJ fica;
- `PARAR` em letras de largura total (U+FF30 e vizinhos).

E `true` para `PARAR` com um emoji simples, `Parar.`, `Pàrar` e BOM seguido de `PARAR`. Teclados e colagens inserem U+200B, U+200E e ZWJ; quem manda assim continua recebendo, sem aviso de que não funcionou. Correção sugerida: `NFKD` no lugar de `NFD` e `\p{Cf}` na classe que é removida. PoC da correção: os oito casos dão `"parar"`, e "não quero parar" continua `"nao quero parar"`. Acrescente os quatro casos ao `webhook.test.ts`.

**SEG5-3, baixa. Um elemento fora do formato descarta o lote inteiro, com os PARAR dentro.** O ADR manda validar o corpo assinado com `whatsappWebhookSchema` e responder 200 com `invalid_payload` quando falha. O schema é tudo ou nada: um único status com `errors[].code` não inteiro, `id` acima de 128, `type` acima de 32 ou `button.text` acima de 256 derruba até 1.000 eventos, e a Meta não repete um 200. Um opt-out perdido assim é falha de LGPD e da política da Meta. Correção sugerida: validar o envelope de forma frouxa e cada status e cada mensagem com `safeParse` próprio, somando os inválidos em `ignored`. Isso pede que o contrato exporte os schemas de elemento; o pedido está no handoff do `arquiteto`.

**Para a integração do `whatsapp-webhook` (a segunda passada confere):**

- passe `WHATSAPP_PHONE_NUMBER_ID` a `readWebhook` sempre que ele existir, não só com `meta`: com `console` e o segredo do app já configurado (durante a montagem da Meta), toda mudança de qualquer número da conta passaria;
- se o `.env.example` ganhar `WHATSAPP_APP_SECRET` ou `WHATSAPP_VERIFY_TOKEN` com `local-demo-`, a função recusa esses valores fora da pilha local (SEG5-8, no handoff do `arquiteto`). O segredo seria público no repositório, e com ele qualquer um forja um PARAR para um número que conheça;
- log só com contagens e códigos; nunca `from`, texto, assinatura ou corpo.

**Para `phone-verification`:** o usuário vem do JWT (`signedInUser`), nunca do corpo; corpo até 1 KiB; telefone e código nunca no log nem no erro; o `wa_id` da resposta da Meta só vai para `whatsapp_messages` (ver SEG5-1 no handoff do `banco-de-dados`, que muda o peso dessa linha no PARAR).

## Bloqueios e dúvidas

SEG5-3 depende do `arquiteto` exportar os schemas de elemento.

## Como testar

`node --test supabase/functions/_shared/whatsapp/webhook.test.ts` com os casos novos de SEG5-2. SEG5-3: um lote assinado com um PARAR válido e um status com `errors[].code` em texto deve chamar `whatsapp_stop_by_wa_id` uma vez.
