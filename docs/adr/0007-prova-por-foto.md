# ADR-0007: Prova por foto

**Status:** aceito pelo arquiteto para a Fase 3. Fica sujeito à validação do humano na aprovação da fase.

## Contexto

A seção 7.6 pede prova por foto em camadas, e a 7.4 diz que uma tarefa com foto só fica verde com prova válida, garantida pelo servidor. O ADR-0005 deixou um lugar para isso no trigger de status. A Fase 2 ensinou três coisas: o cliente hostil chama o REST direto, `insert` e RPC contornam regras escritas num caminho só, e todo recurso precisa de limite.

Limites consultados na documentação da Supabase em 2026-11-01:

- Edge Function: 2 s de CPU por requisição, sem contar I/O; 256 MB de memória; 150 s de ociosidade até o 504.
- Nem a [página de limites](https://supabase.com/docs/guides/functions/limits) nem a de [códigos de status](https://supabase.com/docs/guides/functions/status-codes) trazem limite de corpo da requisição. **Esse número não está documentado**, e a seção 3 trata disso.
- Storage: `allowedMimeTypes` e `fileSizeLimit` por bucket, e upload fora deles é rejeitado. Limite global de 50 MB no Free.
- `createSignedUploadUrl`: a URL vale 2 horas, sem opção documentada de prazo menor. A rota do `supabase/storage` não registra uso do token.
- Service key ignora RLS. Upload pede só `INSERT`, e sobrescrever pede também `SELECT` e `UPDATE`.

## Decisão

### 1. O fluxo

1. O app chama a RPC `issue_proof_challenge` ao abrir a câmera e recebe um nonce.
2. A foto é tirada na câmera do app, reduzida, carimbada e codificada em JPEG. Só então o cliente calcula o SHA-256.
3. O app envia os bytes a `proof-validate`, com o nonce e os metadados no cabeçalho.
4. A função consome o nonce, confere os bytes, grava o objeto e chama `commit_proof`.
5. `commit_proof`, em uma transação, cria a prova e leva a ocorrência a `done`. Os triggers gravam histórico e XP.
6. O admin revê por `review_proof` e vê a foto por uma URL assinada de `proof-url`.

Nenhum passo além do 1 e do 6 é alcançável pelo cliente sem passar pela função.

### 2. Desafio

`issue_proof_challenge(p_occurrence_id)` é uma RPC `security definer` para `authenticated`. É RPC, não Edge Function, porque abrir a câmera não deve pagar partida a frio, e o limite de taxa precisa de transação do mesmo jeito.

A RPC recusa, nesta ordem:

| Condição                                                               | Erro                     |
| ---------------------------------------------------------------------- | ------------------------ |
| Sem sessão, ocorrência invisível, tarefa arquivada                     | `forbidden`              |
| Quem pede não é `assignee` da ocorrência, ou deixou o grupo            | `forbidden`              |
| Tarefa sem `requires_photo_proof`                                      | `proof_not_required`     |
| Estado fora de `pending` e `missed`                                    | `occurrence_not_open`    |
| Prova contestada na ocorrência                                         | `proof_disputed`         |
| Fora da janela de atraso, sem `task.manage_group`                      | `late_window_expired`    |
| `profiles.proof_consent_version` abaixo de `proofRules.consentVersion` | `proof_consent_required` |
| Excede os limites da seção 17, sob `pg_advisory_xact_lock` do usuário  | `challenge_rate_limited` |

Só o `assignee` envia prova, mesmo quando um admin poderia resolver por ele: a foto é de quem fez. Em tarefa própria, os dois são a mesma pessoa.

`proof_challenges` tem `id`, `occurrence_id`, `user_id`, `created_at`, `expires_at` e `used_at`. **O `id` é o nonce**: `gen_random_uuid()` dá 122 bits aleatórios, e uma coluna a mais não acrescentaria nada. O cliente não lê nem escreve nessa tabela.

A resposta é `proofChallengeSchema`: o nonce, `expiresInSeconds` e `checkLocation`. Ela traz uma duração, e não um instante, para o relógio errado do aparelho não interferir.

Não há "direito de upload" além do nonce, porque o cliente nunca fala com o Storage.

### 3. Upload: a função recebe os bytes

**Só `proof-validate` grava no bucket**, com service role. O cliente envia a foto no corpo do `POST`, e nunca recebe URL de upload.

- Corpo: os bytes do JPEG, com `Content-Type: image/jpeg`.
- Cabeçalho `x-proof-meta`: `encodeURIComponent(JSON.stringify(meta))`, com `proofUploadMetaSchema`. Corpo cru dispensa interpretar multipart e vale igual na web e no nativo.
- A função entra no CORS com `x-proof-meta` em `access-control-allow-headers`.

A ordem importa, porque cada etapa é mais cara que a anterior:

1. JWT e usuário. Falha: 401.
2. `x-proof-meta` com Zod, `Content-Type` e `Content-Length`. Falha aqui não consome o nonce.
3. **`claim_proof_challenge`**: um `update ... where used_at is null and expires_at > now() returning` marca o nonce, e a concorrência tem um só vencedor. `used_at` é o horário oficial. A RPC reconfere ocorrência, responsável e janela, e devolve o local do contexto.
4. Leitura do corpo em fluxo, contando bytes. Aborta acima de `maxBytes`, mesmo com `Content-Length` falso ou ausente, e depois de `uploadTimeoutSeconds`, com `upload_timeout`.
5. Checagens sobre os bytes: início `FF D8 FF`, fim `FF D9`, largura e altura lidas do marcador SOF dentro de `[minEdgePx, maxEdgePx]`, hash (seção 4), duplicata (seção 17) e raio (seção 7).
6. Upload em `task-proofs`, caminho `<occurrence_id>/<challenge_id>.jpg`, com `upsert: false`. Nada no caminho vem do cliente.
7. `commit_proof`. Se falhar, a função remove o objeto. Se a função morrer antes disso, a limpeza da seção 14 o remove.

**Uma tentativa por nonce.** Qualquer falha depois do passo 3 exige outro desafio, que conta no limite. Assim, o número de corpos lidos fica limitado pelo número de desafios, e um nonce não serve para martelar a função com 2 MiB repetidos.

Sem decodificar a imagem. Decodificar um JPEG em WASM arrisca os 2 s de CPU por um ganho pequeno, e um JPEG válido e preto passaria do mesmo jeito. O custo é ler 2 MiB e calcular um hash: 1,1 ms por SHA-256 de 2 MiB, medido no Node desta máquina, não no runtime da Supabase.

**Risco aberto:** o limite hospedado de corpo não está documentado. `backend-funcoes` testa `maxBytes` no ambiente local, e a primeira implantação precisa confirmar no projeto hospedado. Se 2 MiB não passar, a saída é a alternativa de upload assinado, com o mesmo `proofUploadMetaSchema`.

### 4. Hash

O cliente calcula o SHA-256 dos bytes finais e o envia em `meta.sha256`. A função calcula o seu sobre os bytes recebidos. Se diferirem, responde `proof_hash_mismatch`.

`task_proofs.sha256` guarda só o valor do servidor, e é ele que serve de evidência. O hash do cliente não prova autenticidade, porque um cliente hostil calcula o hash do que quiser. Ele detecta só corrupção no caminho.

### 5. Horário oficial

- `received_at`: o `used_at` do desafio, gravado pelo Postgres no passo 3. O tempo de transferência não conta contra o usuário.
- `captured_at_device`: o que o cliente declarou.
- `clock_delta_seconds`: `received_at - captured_at_device`.
- `clock_mismatch` entra em `flags` quando o horário do aparelho sai de `[challenge.created_at, received_at]` por mais de `clockToleranceSeconds`. Só sinaliza: relógio errado não é fraude comprovada.

`late` e a janela usam `received_at`, não o instante do commit. Quem enviou às 23:59:50 não se atrasa porque o upload terminou depois da meia-noite.

### 6. Marca d'água

O carimbo é aplicado **no cliente, nos pixels, na captura**, antes do JPEG e do hash:

- Conteúdo: data e hora do aparelho, título da tarefa, nome do usuário.
- Web: `getUserMedia`, vídeo desenhado em `canvas`, texto desenhado no mesmo `canvas`, `toBlob('image/jpeg')`.
- Nativo: `expo-camera`, e `react-native-view-shot` sobre a foto com o texto por cima.
- Redução para `captureLongEdgePx` e qualidade `captureJpegQuality`. O `canvas` e o `view-shot` também descartam o EXIF, inclusive o GPS da câmera.

O que o servidor **não** pode afirmar: que o carimbo existe, que é verdadeiro, ou que a imagem veio de uma câmera. Ele não decodifica pixels, e a marca é só desenho. Ela existe para intimidar a fraude casual e para o revisor bater o olho.

O que vale é a **linha do banco**. A tela de revisão mostra, ao lado da foto, `received_at` e o responsável vindos do servidor. Um carimbo antigo numa foto reaproveitada aparece como diferença visível entre os dois horários.

Não há código do desafio no carimbo: o horário já denuncia o reenvio, e o revisor teria só mais um número para conferir a olho.

### 7. Geolocalização

- `contexts` ganha `location_address`, `location_lat`, `location_lng` e `location_radius_m`, todos preenchidos ou todos nulos, com `check`. Contrato: `contextLocationSchema`. Quem tem `context.manage` edita, e quem vê o contexto vê o endereço.
- **A chave é o contexto.** Com local, as provas das tarefas dele checam a distância. Sem local, o app nem pede a posição. Um interruptor por tarefa pode entrar depois, sem perda.
- **Sem geocodificação.** `address` é texto livre para pessoas, e o ponto vem de "usar minha localização atual". Assim, nenhum endereço vai a terceiros e não há serviço pago.
- O consentimento é a permissão do sistema, depois do aviso da seção 14. Recusar não impede a prova.
- A função calcula a distância por haversine. Fora do raio é `distância - precisão > raio`, então a imprecisão favorece o usuário.
- Sem leitura, ou com `accuracyM > maxLocationAccuracyM`, entra `location_missing`.
- Fora do raio entra `out_of_radius`.
- Com `proofRules.outOfRadius = 'block'`, os dois casos respondem `proof_out_of_radius`, antes de gravar. O bloqueio inclui `location_missing` porque, sem isso, bastaria recusar a permissão. O padrão é `flag`, e a regra é global: nada pede valor por grupo.
- **Minimização:** o servidor guarda `distance_m`, `accuracy_m` e a marca, e **descarta as coordenadas**. O revisor precisa saber se a pessoa estava lá, não onde estava. Isso muda o modelo da seção 8, que previa `lat` e `lng`.

A posição é declarada pelo cliente, então a marca informa e nunca prova.

### 8. Validação atômica e a barreira no banco

`commit_proof` é `security definer`, com `execute` só para `service_role`. Em uma transação:

1. Faz `set_config('request.jwt.claims', ..., true)` com o `sub` do autor. Dali em diante, `auth.uid()`, `has_permission`, `is_group_member` e `status_changed_by` funcionam como numa chamada do usuário, sem alterar nenhum deles. Sem isso, a mudança apareceria no histórico como feita por job, e a isenção de janela de `task.manage_group` não valeria.
2. Trava a ocorrência e confere de novo tudo o que `claim_proof_challenge` conferiu: algo pode ter mudado durante o upload.
3. Insere em `task_proofs`.
4. Atualiza a ocorrência: `status = 'done'`, `current_proof_id` e `proof_review_status`, que é `in_review` com `requires_admin_approval` e `unreviewed` sem.

`set_occurrence_status` não ganha caminho novo: recusa `done` em tarefa com foto com `proof_required`, para qualquer ator.

**Barreiras para qualquer caminho, service role incluído**, em `occurrences_before_status`:

- `done` com `tasks.requires_photo_proof` exige `new.current_proof_id` apontando para uma prova da própria ocorrência, sem `superseded_at`, e `new.proof_review_status` diferente de `disputed`. Fora disso, `proof_required`.
- `done → partial` e `done → missed` exigem `new.proof_review_status = 'disputed'`.
- `partial → done` exige `new.proof_review_status = 'approved'`.
- Um `update` simples de `status` por service role, sem esses campos, falha. O ADR-0005 previa que o `proof-validate` fizesse esse `update`; quem o faz é `commit_proof`.

Caminhos que contornariam a regra, e como cada um fecha:

| Caminho                                                     | Fechamento                                                                                                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `insert` em `task_occurrences` com `status = 'done'`        | Trigger novo `before insert` recusa status diferente de `pending` em tarefa com foto. Hoje o trigger só olha `update`                      |
| `edit_task` desliga `requires_photo_proof` e depois conclui | Só pode mudar as duas flags quem tem a tarefa própria ou `task.manage_group`. Quem tem só `task.edit_assigned` recebe `proof_flags_locked` |
| `edit_task` com `this` destaca a ocorrência sem a flag      | A mesma checagem, antes do `insert` da tarefa nova                                                                                         |
| `tasks.parent_task_id` e `task_id` escritos pelo cliente    | Sem `grant` por coluna. Só `edit_task` os escreve                                                                                          |
| `set_occurrence_status` com `done`                          | `proof_required`, e o trigger logo atrás                                                                                                   |
| `set_occurrence_status` como revisor                        | `reviewer` nunca entra em `actors` dessa RPC, então os pares novos dão `forbidden`                                                         |
| Reabrir e reaproveitar a prova                              | Reabrir zera `current_proof_id` e marca `superseded_at`                                                                                    |
| Prova forjada por outro caminho de service role             | FK composta `(challenge_id, occurrence_id, user_id)` para `proof_challenges` e `unique (challenge_id)`                                     |
| Chamada direta a `claim_proof_challenge` ou `commit_proof`  | `execute` só para `service_role`                                                                                                           |
| Escrita direta nas tabelas de prova                         | Sem `grant` de escrita a `anon` nem `authenticated`                                                                                        |

Mudar a flag vale para as ocorrências abertas: o trigger lê `tasks` na hora da transição. Um admin que desliga a foto de uma tarefa abre mão da prova conscientemente, e é a única saída quando o celular de alguém quebra.

**Sem conclusão manual por admin.** A spec diz que só fica verde com prova válida, e a saída acima é explícita. É a opção fácil de reverter: uma isenção pode entrar depois, e o contrário exigiria limpar dados.

Trancar a data futura fica fora: uma prova para uma ocorrência de amanhã é a mesma questão do XP em massa, decidida para a Fase 6.

### 9. Transições com `requires_photo_proof`

Colunas: como cada ator passa pela transição em tarefa com foto. Sem a flag, nada muda em relação ao ADR-0005.

| Transição                      | `assignee`                             | `editor`, inclusive admin | `deleter`              | `reviewer`         | `system` |
| ------------------------------ | -------------------------------------- | ------------------------- | ---------------------- | ------------------ | -------- |
| `pending → done`               | Só por prova                           | `proof_required`          | —                      | —                  | —        |
| `missed → done`                | Só por prova, dentro da janela         | `proof_required`          | —                      | Desfaz contestação | —        |
| `pending → partial`            | Com motivo, sem foto                   | Com motivo, sem foto      | —                      | —                  | —        |
| `missed → partial`             | Com motivo, sem foto, dentro da janela | Com motivo, sem foto      | —                      | —                  | —        |
| `pending → missed`             | Sim                                    | Sim                       | —                      | —                  | Sim      |
| `done → pending`               | Sim, a prova é superada                | Sim, a prova é superada   | —                      | —                  | —        |
| `done → partial`               | —                                      | —                         | —                      | Contesta           | —        |
| `done → missed`                | —                                      | —                         | —                      | Contesta           | —        |
| `partial → done`               | —                                      | —                         | —                      | Desfaz contestação | —        |
| `partial → pending`            | Sim, exceto contestada                 | Sim, exceto contestada    | —                      | —                  | —        |
| `missed → pending`             | —                                      | Sim, exceto contestada    | —                      | —                  | —        |
| `pending`/`missed → cancelled` | —                                      | —                         | Sim, exceto contestada | —                  | —        |
| `cancelled → pending`          | —                                      | —                         | Sim                    | —                  | —        |

- O amarelo não pede foto: é "tentei e não consegui", e a recompensa da honestidade não depende de câmera.
- **Atraso:** a prova tardia segue a regra geral: `late` verdadeiro, XP de `done_late`, janela de `overdue_at + 72 h`. Quem é `assignee` e tem `task.manage_group` continua sem janela. O reagendamento não ajuda, pela seção 11 do ADR-0005.
- **Contestada:** com `proof_review_status = 'disputed'`, qualquer transição por `set_occurrence_status` exige `can_review_proof`, senão `proof_disputed`. Sem isso, o dono da tarefa própria cancelaria o vermelho, ou reenviaria uma foto por cima da decisão do admin.
- O revisor nunca é o autor, e `set_occurrence_status` não faz o papel dele: contestar e desfazer só por `review_proof`.

**Reabrir:** ao voltar para `pending`, de qualquer estado, o trigger zera `current_proof_id`, `proof_review_status`, `late` e `status_reason`, e marca `task_proofs.superseded_at`. A foto fica até o fim da retenção, como registro, e nunca é reaproveitada: o próximo verde exige novo desafio e foto nova. O XP é compensado pela regra do ADR-0005.

### 10. Revisão e permissões

| Chave          | owner | admin | member | Significado                                          |
| -------------- | ----- | ----- | ------ | ---------------------------------------------------- |
| `proof.review` | sim   | sim   | não    | Ver e revisar as provas das tarefas `group` do grupo |

Uma chave só. Ver sem poder revisar, ou o contrário, não tem pedido real, e uma segunda chave entra sem perda.

**Sub-estado "em análise":** não é um status. É `status = 'done'` com `proof_review_status = 'in_review'`, mostrado em verde-claro, com ícone e rótulo próprios. Status novo exigiria mudar toda tela, a Equipe e a recorrência para algo que se comporta como `done`.

- `in_review` conta como `done` em Hoje, calendário, dia perfeito e taxa da Equipe. Só o XP espera.
- `requires_admin_approval` exige `requires_photo_proof` e `visibility = 'group'`, no Zod e em `check`. Sem foto não há o que revisar, e tarefa privada não tem revisor. A migration normaliza as linhas antigas antes do `check`.
- Sem a flag, a prova nasce `unreviewed` e o admin ainda pode aprovar ou contestar depois.

`review_proof`, RPC para `authenticated`, com `proofReviewInputSchema`. Trava a ocorrência e exige `can_review_proof`: membro atual, `proof.review`, tarefa `group`, tarefa não arquivada e **revisor diferente do autor**. A prova precisa ser `current_proof_id`, senão `proof_superseded`.

| De                          | Decisão               | Status                    | XP                                |
| --------------------------- | --------------------- | ------------------------- | --------------------------------- |
| `in_review`                 | aprovar               | `done`, sem mudança       | Concede agora                     |
| `unreviewed`                | aprovar               | `done`, sem mudança       | Nada, já concedido                |
| `in_review` ou `unreviewed` | contestar → `partial` | `done → partial`          | Compensa e concede o de `partial` |
| `in_review` ou `unreviewed` | contestar → `missed`  | `done → missed`           | Compensa, e o saldo fica zero     |
| `approved`                  | contestar             | Como acima                | Como acima                        |
| `disputed`                  | aprovar               | `partial`/`missed → done` | Compensa e concede o de `done`    |
| Mesma decisão               | —                     | `proof_already_reviewed`  | Nada                              |

- Contestar exige motivo, que vira `status_reason` e fica visível a quem vê a ocorrência.
- Uma contestação mantém `late` como estava, em vez de usar o relógio: uma revisão na semana seguinte não atrasa quem foi pontual. Em `missed`, `late` vira falso. Desfazer recalcula pelo `received_at`.
- Mudar de `partial` para `missed` contestado exige aprovar antes. Não é um caso comum, e evita mais dois pares na tabela.
- `task_proofs` guarda a decisão atual em `review_status`, `reviewed_by`, `reviewed_at` e `review_note`.
- **Auditoria:** `task_status_history` ganha `proof_review_status`. A contestação grava pelo trigger. A aprovação não muda status, então `review_proof` insere uma linha com `from_status = to_status`, e o histórico guarda todas as decisões em ordem.

**Grupo com um admin só:** ele não aprova a própria prova, e uma tarefa própria com aprovação ficaria em análise até a retenção. A tela de tarefa só oferece a aprovação quando o responsável é outra pessoa. Quem usa o REST direto só atrapalha a si mesmo.

**Quem vê** (`can_view_proof`, usada na política de `task_proofs` e em `proof-url`):

| Pessoa                                               | Vê a prova?                                                     |
| ---------------------------------------------------- | --------------------------------------------------------------- |
| Autor, com acesso atual à tarefa                     | Sim                                                             |
| Quem tem `proof.review`, em tarefa `group`           | Sim                                                             |
| Admin, em tarefa `private`                           | Não, nem com `proof.review`                                     |
| Colega, inclusive quem foi responsável por outro dia | Não: `can_view_task` não basta. Foto é mais sensível que status |
| Criador da tarefa sem `proof.review`                 | Não                                                             |
| Ex-membro, autor ou não                              | Não. Autor recebe as próprias fotos pela exportação de F8-3     |

`proof_review_status` fica em `task_occurrences`, para as listas não juntarem `task_proofs`. Só `commit_proof`, `review_proof` e os triggers o escrevem. Não vaza a foto.

### 11. XP

| Momento                  | Sem aprovação           | Com aprovação |
| ------------------------ | ----------------------- | ------------- |
| `commit_proof`           | XP base, na hora        | Nada          |
| Aprovar                  | Nada                    | XP base       |
| Contestar → `partial`    | Compensa e dá o amarelo | Dá o amarelo  |
| Contestar → `missed`     | Compensa                | Nada          |
| Retenção vence a revisão | Nada                    | XP base       |

- O XP base é o do ADR-0005: `done` ou `done_late`, conforme `late`, vezes a dificuldade.
- O corpo de `occurrences_after_status` que calcula XP vira a função interna `occurrence_award_xp(occurrence)`: compensa o saldo e concede o valor do estado. O trigger a chama, exceto em `in_review`, e `review_proof` a chama ao aprovar. Não há duas contas de XP.
- **Sem bônus nesta fase.** A seção 7.11 fala em bônus por foto, e a Fase 6 é dona dele. O modelo já o comporta: será um `xp_events` com a mesma `occurrence_id` e um `reason` novo, concedido em `occurrence_award_xp`. O saldo por ocorrência o compensa sem código extra, inclusive na contestação.
- A Fase 6 precisa olhar `proof_review_status` antes de contar dia perfeito ou ofensiva com ocorrência em análise.

### 12. URLs assinadas

`proof-url` recebe `proofUrlInputSchema`. Lê `task_proofs` com o JWT do usuário: se a RLS devolve a linha, ele pode ver. Depois, cria a URL com service role, por `signedUrlTtlSeconds`, 60 s.

O cliente não cria a URL. Com uma política de `SELECT` em `storage.objects`, um cliente hostil escolheria o prazo que quisesse, e a RLS não limita isso.

Quem tem a URL acessa o objeto até ela vencer, sem login. Por isso o prazo é curto, e a tela pede outra a cada abertura. Com `photo_deleted_at`, a resposta é `proof_photo_deleted`.

### 13. Imutabilidade

- Bucket `task-proofs`: `public = false`, `file_size_limit` e `allowed_mime_types` iguais a `proofRules`, criado por migration. É a segunda barreira de tamanho e tipo depois da função.
- **Nenhuma política em `storage.objects` para esse bucket.** Sem política, `anon` e `authenticated` não inserem, leem, sobrescrevem nem apagam. É a regra mais curta que existe, e o teste prova.
- `upsert: false`, sem exceção. O caminho é único por desafio, e sobrescrever criaria um objeto diferente do hash da linha.
- `task_proofs` não tem `grant` de escrita para `anon` nem `authenticated`.
- Trigger `before update` em `task_proofs` recusa mudança em `occurrence_id`, `challenge_id`, `sha256`, `received_at`, `captured_at_device` e `user_id` de valor para outro valor. Vale também para service role. `user_id` pode ir a nulo, por `on delete set null`.
- O objeto só sai pela retenção ou por F8-3, sempre pela API do Storage. Apagar em `storage.objects` por SQL deixaria o arquivo órfão.

### 14. Retenção e LGPD

Job `proof-retention`, Edge Function chamada por cron a cada hora com `x-cron-secret`, como `materialize-occurrences`. Cada execução trata até `retentionBatchSize` provas com `received_at < now() - retentionDays`, as mais antigas primeiro:

1. Prova corrente em `in_review` vira `approved` com `reviewed_by` nulo e nota de sistema, e o XP é concedido. O usuário não perde XP pela demora do admin, e a foto não fica sem prazo.
2. Remove o objeto pela API do Storage.
3. Na linha: grava `photo_deleted_at` e zera `storage_path`, `user_agent`, `distance_m` e `accuracy_m`.

Repetir é seguro: remover um objeto inexistente não é erro. O job também:

- Remove objetos do bucket sem linha em `task_proofs` e com mais de 24 horas, o que cobre a função que morreu entre upload e commit, e o grupo apagado em cascata.
- Apaga desafios com mais de 24 horas sem prova.

**O que fica:** hash, horários, tamanho, marcas, decisão, autor, histórico e XP. Isso sustenta a auditoria sem a imagem.

Mudar `retentionDays` vale de imediato, para todas as fotos, e exige migration, como `taskRules`.

**Consentimento e transparência.** Antes da primeira prova, e sempre que `consentVersion` subir, o app mostra um aviso e registra o aceite em `profiles.proof_consent_version` e `proof_consent_at`, pela RPC `record_proof_consent`. O aviso diz:

- o que é coletado: foto, horário, aparelho e navegador, versão do app e, se o contexto tiver local, a distância até ele;
- que coordenadas não são guardadas;
- quem vê: você e os admins do grupo, nunca colegas; em tarefa privada, só você;
- que a foto é apagada depois de 90 dias, lido de `retentionDays`, e o registro sem a imagem fica.

Quem recusa não envia prova, mas pode marcar amarelo ou vermelho. O servidor exige o aceite, para um cliente hostil não pular a tela. Exportar os dados e excluir a conta ficam em F8-3, que precisa cobrir fotos e objetos.

### 15. Limitação honesta

**Na web, não dá para garantir que a foto veio de uma câmera, nem que foi tirada na hora.**

- Câmeras virtuais são dispositivos normais para `getUserMedia`, e o navegador não as distingue.
- O cliente é do usuário: quem chama a API direto envia qualquer JPEG, com hash, carimbo e horário coerentes.
- Uma foto de uma tela, ou de outra foto, é uma foto real.
- Localização e horário do aparelho são declarações.

O que as camadas entregam é outra coisa: elevar o custo da fraude casual, garantir que o verde não saia sem passar pelo servidor, fixar o horário real de recebimento, impedir o reenvio dos mesmos bytes, tornar o registro imutável e colocar um humano no fim. Quem precisa de mais usa `requires_admin_approval`.

No app nativo, Play Integrity e App Attest podem atestar que o binário é legítimo. Ficam para uma fase futura, e `proof_challenges` já tem o nonce que esses serviços exigem. Eles também não resolvem a foto de uma tela. O aviso ao administrador deve dizer isso, sem prometer certeza.

### 16. Offline

Prova nunca entra em fila. A validação do servidor é a própria prova, e um desafio vence em 5 minutos. Sem conexão, o botão de câmera fica desabilitado com explicação, e a fila de F8-5 precisa recusar `done` em tarefa com foto. `partial` e `missed` seguem pela fila normal.

Depois de uma falha, o app relê a ocorrência antes de tentar de novo: a resposta pode ter se perdido com a prova já gravada. `proof_duplicate` num reenvio dos mesmos bytes também manda reler. Uma foto mantida na tela pode ir de novo com outro desafio, e `clock_mismatch` denuncia se demorar demais.

**Nada em disco depois da captura.** O app nunca grava a foto: os bytes finais vivem na memória da tela. Há uma exceção, que dura segundos e só existe no nativo: `takePictureAsync`, do `expo-camera` 58, sempre grava o JPEG bruto no cache do app, mesmo com `base64` ligado (conferido nas fontes de Android e iOS). Esse arquivo não tem carimbo, e o aviso da seção 14 promete apagar a foto em 90 dias, então ele não pode ficar para trás.

- `ProofCamera.native` apaga o arquivo no `finally` de `capture`, com sucesso ou falha, por `new File(uri).delete()`, de `expo-file-system`.
- Falha ao apagar não derruba a prova. O arquivo já cumpriu o papel, e perder a foto do usuário por isso seria pior.
- Se o app morrer entre a foto e o `finally`, o arquivo fica no cache privado até o sistema limpá-lo. É o risco aceito: nenhum outro app o lê, e não vale um varredor de cache para esse intervalo.
- `react-native-view-shot` com `result: 'base64'` não cria arquivo. Só o padrão `tmpfile` criaria.
- Na web não há arquivo: `canvas` e `Blob` ficam na memória.

### 17. Abuso

Tudo em `proofRules`, com espelho em `app_settings`, chave `proof_rules`.

| Recurso                  | Limite                                                         | Onde                              |
| ------------------------ | -------------------------------------------------------------- | --------------------------------- |
| Desafios por usuário     | 30 por hora                                                    | `issue_proof_challenge`           |
| Desafios por ocorrência  | 10 por hora                                                    | `issue_proof_challenge`           |
| Provas por usuário       | 30 por dia                                                     | `issue_proof_challenge`           |
| Corpos lidos             | 1 por nonce                                                    | `claim_proof_challenge`           |
| Tamanho                  | 2 MiB                                                          | `Content-Length`, leitura, bucket |
| Tempo de leitura         | 30 s                                                           | Função                            |
| Tipo                     | `image/jpeg`, com bytes conferidos                             | Função, bucket                    |
| Dimensões                | 320 a 2048 px                                                  | Função                            |
| Reenvio dos mesmos bytes | `unique (sha256)` em `task_proofs`, responde `proof_duplicate` | Função, depois banco              |
| `x-proof-meta`           | Zod, com texto de até 40 caracteres                            | Função                            |
| `user_agent`             | 256 caracteres                                                 | Função                            |
| Linhas de desafio        | Limpas depois de 24 horas                                      | `proof-retention`                 |

Pior caso de uma conta hostil: 30 × 2 MiB por dia, cerca de 5,3 GiB em 90 dias, sempre com arquivos diferentes, porque o `unique` por hash não deixa repetir.

O limite de desafios entra em F3-2, e não em F8-4: a seção 9 o exige, e basta contar linhas de `proof_challenges`. `proof-validate` não tem limite próprio por usuário, porque uma chamada sem nonce válido para em uma ida ao banco, sem ler o corpo.

Logs das funções: código de erro e etapa. Nunca nonce, hash, coordenadas, caminho ou nome.

### 18. Custos

| Plano | Armazenamento                    | Tráfego | Invocações |
| ----- | -------------------------------- | ------- | ---------- |
| Free  | 1 GB                             | 5 GB    | 500 mil    |
| Pro   | 100 GB, depois US$ 0,0213 por GB | 250 GB  | 2 milhões  |

Valores da [página de preços](https://supabase.com/pricing), em 2026-11-01. O Pro custa a partir de US$ 25 por mês. O Free pausa o projeto depois de uma semana sem uso.

O tamanho da foto ainda não foi medido. Com 0,5 MB, 1 GB guarda 2 mil fotos, cerca de 22 provas por dia em 90 dias. No limite de 2 MiB, são 500 fotos, cerca de 5 por dia. Quando a primeira foto real existir, `prova-foto` mede e registra.

### 19. Códigos de erro

**Critério:** `proofErrorCodeSchema` lista só o que a tela nomeia com mensagem própria. Qualquer outro valor em `{ error }` é a falha genérica, inclusive um código que ainda não existe, então ficar de fora é seguro.

| Código                                                              | Onde                   | Decisão | Motivo                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------- | ---------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `upload_timeout`                                                    | `proof-validate`, 408  | Entra   | A pessoa vê um motivo próprio, "a conexão ficou lenta", e a reação é outra: não adianta trocar a foto. `proof_too_large` não serve                                                                                                                                                                                            |
| `unauthorized`, `invalid_request`, `method_not_allowed`, `internal` | Todas as funções       | Fora    | Valem para qualquer função, inclusive as de cron, e não têm mensagem própria. Pertencem à prova tanto quanto a um `fetch`                                                                                                                                                                                                     |
| `invalid_storage_path`                                              | `commit_proof`         | Fora    | Só `proof-validate` chama, e ela monta o caminho. É defeito nosso, e precisa virar `internal` com log. `databaseFailure` decide isso pela lista: incluí-lo trocaria a falha por uma recusa sem status                                                                                                                         |
| `invalid_decision`                                                  | `review_proof`         | Fora    | `proofReviewInputSchema` recusa antes da rede. Só chega quem chama o REST direto                                                                                                                                                                                                                                              |
| `invalid_consent_version`                                           | `record_proof_consent` | Fora    | O único dos três que um cliente honesto alcança: um app antigo depois de subir `consentVersion`. A recusa é o certo, porque ele mostrou o texto velho, e a saída é atualizar o app, que nenhuma mensagem nesta tela resolve. É raro, a web corrige ao recarregar, e o nativo só existe em F8-7. Entra sem perda se isso mudar |

Quem consome a lista precisa cobrir `upload_timeout`, e `Record<ProofErrorCode, ...>` falha na compilação até isso acontecer. Os outros quatro seguem sem contrato, como em `materialize-occurrences`.

## Alternativas

- **`transportErrorCodeSchema` à parte, com os cinco códigos:** uma lista a mais para ler em dobro, e quatro códigos que nenhuma tela distingue. `upload_timeout` já cabe na definição da lista atual.

- **Upload assinado direto ao Storage:** evita o tráfego na função, mas a URL vale 2 horas contra 5 minutos do desafio, sem registro de uso. O objeto passaria a existir antes de qualquer validação, e a função teria de baixá-lo para calcular o hash, então os bytes passariam por ela do mesmo jeito. Exigiria ainda um bucket de quarentena e uma limpeza maior. Compensa com arquivos grandes, não com 2 MiB. É a saída se o corpo hospedado não aceitar 2 MiB.
- **Política de `INSERT` no Storage para o cliente:** a regra "o cliente nunca grava" deixaria de ser verdadeira, e a RLS do Storage não confere conteúdo.
- **Marca d'água no servidor:** exigiria decodificar e recodificar a imagem contra 2 s de CPU, e o hash do cliente deixaria de bater. O carimbo também deveria nascer na captura, como pede a spec.
- **Desafio por Edge Function:** partida a frio ao abrir a câmera, e a mesma transação no banco.
- **Consumir o nonce só no sucesso:** um nonce permitiria vários corpos até vencer. A falha de rede fica mais barata, mas o limite por desafio deixa de limitar o que a função lê.
- **`set_config` próprio como senha de que a prova foi validada:** frágil, e uma coluna verificável no trigger diz o mesmo.
- **`commit_proof` com o JWT do usuário:** o cliente hostil a chamaria direto.
- **Status novo `in_review`:** ver seção 10.
- **Admin conclui sem foto:** contradiz a seção 7.4.
- **`can_view_task` como regra da foto:** daria a foto a quem foi responsável por outro dia da série.
- **Guardar `lat` e `lng`:** o revisor não precisa, e isso vira histórico de posição de funcionários.
- **Geocodificar o endereço:** custo, um terceiro recebendo endereços e erro de posição, para algo que o celular resolve no próprio local.
- **Chave `proof.view`:** sem pedido real. Pode entrar depois.

## Consequências

- `occurrence_actor` ganha `reviewer`, e `occurrenceTransitions` ganha quatro linhas, então `pnpm db:check-permissions` falha até F3-2 entrar. O mesmo vale para `proof.review`.
- `done → partial` deixa de ser "reabra antes" para o revisor. Para os demais, nada muda.
- Trocar o `requires_photo_proof` deixa de ser livre para quem tem só `task.edit_assigned`.
- A Fase 6 herda: bônus de foto, adiantamento de prova e `in_review` em dia perfeito e ofensiva.
- A Fase 4 herda o aviso ao usuário em contestação e ao admin em "em análise".
- `proof-validate` usa a API pública do Storage dentro da requisição, então uma falha do Storage vira falha da prova, e o usuário tenta de novo com outro desafio.
- A prova contestada só volta por quem tem `proof.review`. Em um grupo com um admin só, a prova dele mesmo nunca é revista.
