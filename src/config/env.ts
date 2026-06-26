import { z } from 'zod';

const EnvSchema = z.object({
  /** Pasta da sessão do WhatsApp (credenciais). */
  AUTH_DIR: z.string().min(1).default('auth'),
  /** Pasta raiz do conteúdo coletado. */
  DATA_DIR: z.string().min(1).default('data'),
  /** Arquivo de configuração de grupos. */
  GROUPS_CONFIG: z.string().min(1).default('groups.config.json'),
  LOG_LEVEL: z.string().default('info'),
  BAILEYS_LOG_LEVEL: z.string().default('warn'),
  /** Porta da API de controle local (envio de mensagens). Só em 127.0.0.1. */
  CONTROL_PORT: z.coerce.number().int().positive().default(4310),
  /** Número com DDI (só dígitos, ex: 5511999999999) para pareamento headless por
   * código (servidor sem tela, tipo a nuvem). Vazio = fluxo por QR no terminal. */
  PAIR_NUMBER: z.string().trim().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

/** Config carregada e validada uma única vez no boot. */
export const env: Env = EnvSchema.parse(process.env);
