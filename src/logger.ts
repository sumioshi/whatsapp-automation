import pino from 'pino';

const level = process.env.LOG_LEVEL ?? 'info';
const usePretty = process.env.NODE_ENV !== 'production';

/** Logger raiz da aplicação. */
export const logger = pino({
  level,
  ...(usePretty
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
});

/** Logger dedicado ao Baileys (costuma ser barulhento) com nível próprio. */
const baileysBase = logger.child(
  { module: 'baileys' },
  { level: process.env.BAILEYS_LOG_LEVEL ?? 'warn' },
);

/**
 * Ruído conhecido e BENIGNO do Baileys que filtramos da log (não afeta a coleta
 * de mensagens). Cada entrada é casada por substring na mensagem do log.
 *
 * - "blocked on missing key": app-state sync (arquivar/fixar/silenciar/marcar
 *   lido — config de chat que você mexe NO CELULAR) reenviado a cada ~10min.
 *   O Baileys não acha a app-state-sync-key de um record do snapshot (típico de
 *   auth/ migrado entre máquinas), tenta 2x e "estaciona". É comportamento
 *   intencional do rc pra sobreviver com estado parcial; mensageria/mídia/
 *   reações seguem intactas. Silenciar só esta linha mantém os demais warns.
 *
 * - "No session found to decrypt message" + "transaction failed, rolling back":
 *   numa mensagem de GRUPO (skmsg = SenderKey), o Baileys topa com a sender key
 *   de um participante que ele ainda não recebeu nesta sessão — típico na
 *   RECONEXÃO, pra msgs que chegaram com o Mac desligado. Não derruba o coletor
 *   nem afeta outros grupos; as próximas msgs do mesmo grupo decifram normal.
 *   Filtramos só esta causa específica (No session found) — um erro de decrypt
 *   de OUTRA causa ainda aparece.
 */
const BAILEYS_LOG_NOISE = [
  'blocked on missing key',
  'transaction failed, rolling back',
];

function isBaileysNoise(args: unknown[]): boolean {
  // Baileys chama logger.warn(msg), logger.warn(obj, msg) — e nesse caso o ruído
  // que queremos casar pode estar tanto na string `msg` quanto dentro do `obj`
  // de contexto (ex.: o "failed to decrypt message" vem como msg, mas a causa
  // benigna "No session found" vem em obj.err.message). Casamos contra a msg E
  // contra o objeto serializado pra pegar os dois.
  const msg = typeof args[0] === 'string' ? args[0] : typeof args[1] === 'string' ? args[1] : '';
  if (BAILEYS_LOG_NOISE.some((needle) => msg.includes(needle))) return true;
  // "failed to decrypt message" só é benigno quando a causa é "No session found"
  // (reconexão). Outras causas de decrypt continuam aparecendo.
  if (msg.includes('failed to decrypt message')) {
    const ctx = typeof args[0] === 'object' && args[0] ? JSON.stringify(args[0]) : '';
    return ctx.includes('No session found to decrypt message');
  }
  return false;
}

type PinoLike = typeof baileysBase;

/** Envolve um logger pino dropando só o ruído conhecido de warn/error; o resto
 * passa intacto. Recursivo no `.child()`: o Baileys deriva childs internamente e
 * loga neles, então o filtro precisa acompanhar a árvore (senão o ruído vaza
 * pelos childs). */
function filterNoise(base: PinoLike): PinoLike {
  return new Proxy(base, {
    get(target, prop, receiver) {
      if (prop === 'warn' || prop === 'error') {
        return (...args: unknown[]) => {
          if (isBaileysNoise(args)) return;
          return (target[prop as 'warn' | 'error'] as (...a: unknown[]) => void)(...args);
        };
      }
      if (prop === 'child') {
        return (...args: unknown[]) =>
          filterNoise((target.child as unknown as (...a: unknown[]) => PinoLike)(...args));
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

export const baileysLogger = filterNoise(baileysBase);
