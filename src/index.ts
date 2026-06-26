import { watch } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Collector } from './app/collector.js';
import { env } from './config/env.js';
import { GroupConfig } from './config/groups.js';
import { startControlServer } from './control/server.js';
import type { GroupInfo } from './core/message.js';
import { logger } from './logger.js';
import { FileStore } from './storage/fileStore.js';
import { PresenceStore } from './storage/presenceStore.js';
import { StatusStore } from './storage/statusStore.js';
import { BaileysGateway } from './whatsapp/gateway.js';

async function main(): Promise<void> {
  // --- Composition root: instancia adapters concretos e injeta nas dependências ---
  // Garante as pastas-raiz antes de qualquer store escrever. Num volume novo (1º
  // deploy na nuvem) DATA_DIR/AUTH_DIR ainda não existem, e os sidecars de raiz
  // (.collector-status.json etc.) gravam direto em DATA_DIR sem criar a pasta —
  // sem isto o boot quebra em loop com ENOENT.
  await mkdir(env.DATA_DIR, { recursive: true });
  await mkdir(env.AUTH_DIR, { recursive: true });

  const groupConfig = new GroupConfig(env.GROUPS_CONFIG);
  await groupConfig.load();

  const store = new FileStore(env.DATA_DIR);
  const status = new StatusStore(env.DATA_DIR);
  const presence = new PresenceStore(env.DATA_DIR);
  const collector = new Collector(store, groupConfig, presence);
  const gateway = new BaileysGateway(env.AUTH_DIR, env.DATA_DIR, env.PAIR_NUMBER);

  // Publica o estado de conexão (QR/open/close) para o painel ler.
  gateway.onStatus((s) => {
    void status.setConnection(s.connection, s.qr);
  });

  // Quando a lista de grupos chega, mescla no arquivo e orienta o usuário.
  gateway.onGroups(async (groups) => {
    await groupConfig.sync(groups);
    const watched = groupConfig.watchedCount();
    await status.setWatchedCount(watched);
    if (watched === 0) {
      logger.warn(
        `Nenhum grupo monitorado. Use o painel (Configurações › Grupos) ou edite ` +
          `"${env.GROUPS_CONFIG}" marcando "watch": true (recarrego sozinho, sem reiniciar).`,
      );
    } else {
      logger.info({ watched }, '🎯 Grupos monitorados ativos.');
    }
    // Atualiza a foto (avatar.jpg) só dos grupos monitorados, sequencial para
    // não estourar rate-limit. Grupos sem foto são ignorados silenciosamente.
    void refreshAvatars(gateway, collector, groupConfig, groups);
  });

  // Cada mensagem nova é entregue ao collector (fire-and-forget seguro).
  gateway.onMessage((msg) => {
    void collector.handle(msg);
  });

  // Reações (emoji) também.
  gateway.onReaction((reaction) => {
    void collector.handleReaction(reaction);
  });

  // Confirmações de entrega/leitura das minhas mensagens.
  gateway.onReceipt((receipt) => {
    void collector.handleReceipt(receipt);
  });

  // Presença (digitando/online/visto por último) — estado efêmero, sidecar volátil.
  gateway.onPresence((p) => {
    collector.handlePresence(p);
  });

  // Enquetes: definição (opções) e votos decifrados.
  gateway.onPoll((poll) => {
    void collector.handlePoll(poll);
  });
  gateway.onPollVote((vote) => {
    void collector.handlePollVote(vote);
  });

  // Chamadas (offer/accept/reject/timeout) — linha de sistema no timeline.
  gateway.onCall((call) => {
    void collector.handleCall(call);
  });

  // Edição/remoção de mensagem recebida — sidecar aplicado na leitura.
  gateway.onEdit((edit) => {
    void collector.handleEdit(edit);
  });
  gateway.onDelete((del) => {
    void collector.handleDelete(del);
  });

  watchGroupsConfig(env.GROUPS_CONFIG, groupConfig, status);
  startControlServer(gateway, env.CONTROL_PORT, [env.DATA_DIR, tmpdir()]);
  registerShutdown(gateway);

  logger.info('🚀 Coletor iniciando...');
  await gateway.start();
}

/**
 * Busca e salva a foto (avatar.jpg) de cada grupo monitorado, em sequência e
 * com uma pausa curta entre os pedidos para evitar rate-limit do WhatsApp.
 */
async function refreshAvatars(
  gateway: BaileysGateway,
  collector: Collector,
  groupConfig: GroupConfig,
  groups: GroupInfo[],
): Promise<void> {
  for (const g of groups) {
    if (!groupConfig.isWatched(g.id)) continue;
    const url = await gateway.getAvatarUrl(g.id);
    await collector.saveAvatar(g.id, g.name, url);
    await delay(400);
  }
}

/** Recarrega o groups.config.json quando o arquivo muda (sem reiniciar). */
function watchGroupsConfig(path: string, groupConfig: GroupConfig, status: StatusStore): void {
  const target = resolve(path);
  const dir = dirname(target);
  const file = basename(target);
  let timer: NodeJS.Timeout | null = null;

  try {
    watch(dir, { persistent: false }, (_event, changed) => {
      if (changed !== file) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        groupConfig
          .load()
          .then(async () => {
            const watched = groupConfig.watchedCount();
            await status.setWatchedCount(watched);
            logger.info({ watched }, '♻️  groups.config.json recarregado.');
          })
          .catch((err) => logger.error({ err }, 'Falha ao recarregar groups.config.json.'));
      }, 250);
    });
  } catch (err) {
    logger.warn({ err }, 'Não foi possível observar groups.config.json (hot-reload off).');
  }
}

/** Encerramento limpo em SIGINT/SIGTERM. */
function registerShutdown(gateway: BaileysGateway): void {
  let closing = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (closing) return;
    closing = true;
    logger.info({ signal }, '🛑 Encerrando...');
    await gateway.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err }, 'Erro fatal na inicialização.');
  process.exit(1);
});
