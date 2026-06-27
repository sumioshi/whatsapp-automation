# Edição de perfil + recado de expediente — design

**Data:** 2026-06-26
**Motivação:** O Rodrigo tem perfil WhatsApp Business e quer (a) editar o perfil (nome, recado/"sobre", foto) pela ferramenta — tanto na mão quanto pedindo pra IA — e (b) que o recado mude sozinho fora do expediente (ex: fim de semana → "fora, volto seg"), pra quem abrir o perfil saber que ele não está disponível, sem mandar mensagem automática pro cliente.

## O que o WhatsApp/Baileys PERMITE (verificado)

Baileys expõe (escrita): `updateProfileName`, `updateProfileStatus` (o "sobre"/recado), `updateProfilePicture`. Leitura: `getBusinessProfile`, `profilePictureUrl`.

**NÃO permite editar** (só o app oficial / API oficial paga): catálogo/produtos, localização do negócio, horário de funcionamento oficial, link do site, categoria business. Esses campos são read-only via Baileys. Portanto o "avisar que está fora" é feito pelo **recado/"sobre"**, não por um campo de expediente do business.

## Escopo

Duas partes; a 2 depende da 1.

### Parte 1 — Editar perfil (manual + via IA)

Três métodos novos no gateway, espelhando o padrão de `sendText`/`sendMedia`:
- `updateProfileName(nome: string)`
- `updateProfileStatus(recado: string)`
- `updateProfilePicture(buf: Buffer)`

Três endpoints novos na API de controle (`:4310`, só 127.0.0.1):
- `POST /profile/name` `{ name }`
- `POST /profile/status` `{ status }`
- `POST /profile/picture` `{ path }` (caminho de imagem local)

Uma tool MCP `editar_perfil({ nome?, recado?, foto? })` que chama os endpoints. **A IA pode editar:** quando o Rodrigo pede "muda meu recado pra X" / "troca a foto", a IA chama a tool. Painel também ganha os controles (UI manual). Os três caminhos (IA, painel, manual) batem na mesma API de controle.

**Confirmação:** editar o perfil é ação real e pública (todo contato vê). A IA **mostra o que vai mudar e espera OK** antes de aplicar — mesma convenção do envio a cliente. Não é trava de código, é convenção respeitada (consistente com o `definir_modo`/`responder`).

### Parte 2 — Recado de expediente automático

**Config** (`expediente.json` em DATA_DIR — arquivo próprio, pra não misturar com a config de grupos):
```json
{
  "ativo": true,
  "timezone": "America/Sao_Paulo",
  "dias": { "seg": ["09:00","18:00"], "ter": ["09:00","18:00"], ... },
  "recado_dentro": "<recado normal do expediente>",
  "recado_fora": "Fora do expediente. Respondo seg-sex, 9h-18h."
}
```
Dia ausente ou faixa vazia = fora o dia todo (ex: sáb/dom sem entrada = sempre "fora"). Configurável: o Rodrigo define dias e horários.

**Agendador no coletor** (`src/`, onde o socket vive): um timer (a cada ~5min) que:
1. calcula se o horário atual (no timezone) está DENTRO ou FORA do expediente;
2. compara com o último estado aplicado (persistido, ex: `.expediente-state.json`);
3. **só na transição** (dentro↔fora), chama `updateProfileStatus` com o recado correspondente.

Nunca reescreve o recado se o estado não mudou (evita escrita repetida e antispam). No boot, aplica o estado atual se divergir do persistido.

**Controle:** ligar/desligar via config (`ativo`). Regra de prioridade pro MVP (sem `pausar_ate`, YAGNI): o agendador sempre vence nas transições de estado. Se o Rodrigo setar um recado na mão via `editar_perfil`, ele dura até a próxima transição de expediente, quando o agendador sobrescreve. Simples e previsível.

## Arquitetura (resumo)

```
IA (MCP editar_perfil) ─┐
painel (UI)            ─┼─► API controle :4310 ─► gateway.updateProfile* ─► Baileys ─► WhatsApp
agendador (coletor)    ─┘        (POST /profile/*)
```

O gateway é o único que toca o socket. A API de controle é a fronteira. O agendador (dentro do coletor) chama o gateway direto (mesmo processo), não via HTTP.

## Riscos e limites

- **Antispam:** trocar nome/foto/recado com frequência pode chamar atenção do WhatsApp. A troca de recado nas transições de expediente (poucas por semana) é segura; o agendador não reescreve sem mudança de estado. Foto/nome: editar com parcimônia.
- **Conexão:** se o coletor estiver desconectado na hora da transição, a troca falha; o agendador tenta de novo no próximo tick (idempotente — compara estado).
- **Read-only do business:** catálogo/localização/expediente-oficial NÃO são editáveis; o recado é o substituto.

## Testes

- Função pura `estadoExpediente(agora, config)` → `'dentro'|'fora'` (testável: dias, faixas, viрадas de meia-noite, dia ausente, timezone). É o núcleo do agendador.
- A lógica de "só troca na transição" (comparar estado novo vs persistido) — testável isolada.
- gateway/Baileys e a troca real ficam fora dos testes (I/O), validados manualmente.

## Fora de escopo

- Editar catálogo/produtos/localização (WhatsApp não permite).
- Auto-resposta de mensagem ao cliente (o Rodrigo descartou — risco de soar frio/spam; o recado passivo cobre o caso).
- Múltiplos perfis/contas.
