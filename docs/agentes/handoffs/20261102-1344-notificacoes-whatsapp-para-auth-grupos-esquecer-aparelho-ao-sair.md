# Handoff: notificacoes-whatsapp para auth-grupos, esquecer o aparelho ao sair da conta

**De:** notificacoes-whatsapp | **Para:** auth-grupos | **Data:** 2026-11-02 13:44 (BRT, derivada de UTC menos 3) | **Branch:** `feat/notifications-ui`

## Contexto

[ADR-0008](../../adr/0008-notificacoes-push-pwa-vermelho-automatico.md), seção 3: ao sair da conta, o app cancela a inscrição de push no navegador e apaga a linha de `push_subscriptions`, para o próximo usuário do mesmo navegador não receber avisos de outro. A linha só pode ser apagada com a sessão ainda viva (RLS), então isso precisa rodar antes de `authRepository.signOut`, que está em `ProfileScreen`.

## O que foi entregue

`forgetThisDevice(): Promise<void>`, exportado de `@azkaban/feature-notifications`. Apaga a linha deste navegador, cancela a inscrição e limpa a marca local. Nunca rejeita: falhas de rede são engolidas, para não travar a saída. Sem push ativo, não faz nada.

Enquanto isso não entra, o vazamento já é contido: ao abrir o app com outra conta, a marca local mostra que a inscrição é de outra pessoa, e o app a cancela no navegador em vez de adotá-la. A linha antiga fica até o próximo envio, quando o serviço de push responde 410 e o despacho a apaga.

## Contratos criados ou alterados

Nenhum.

## O que o destinatário precisa fazer

1. `ProfileScreen` aceita `onBeforeSignOut?: () => Promise<void>` e o espera antes de `authRepository.signOut` (no `mutationFn`).
2. A rota `apps/app/app/(app)/(tabs)/profile.tsx` passa `onBeforeSignOut={forgetThisDevice}`. A rota é sua; se preferir, eu faço essa linha quando a propriedade existir.
3. Opcional, a pedido do orquestrador: mostrar `PushSetupCard` (`vapidPublicKey={env.EXPO_PUBLIC_VAPID_PUBLIC_KEY}`) no onboarding, por composição de rota.

## Bloqueios e dúvidas

Nenhum.

## Como testar

Com `EXPO_PUBLIC_VAPID_PUBLIC_KEY`, ativar notificações em Perfil > Notificações, sair da conta e conferir que `push_subscriptions` não tem mais a linha daquele usuário.
