import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // O painel importa por "@/..." (alias do tsconfig do web). Sem espelhar o
  // alias aqui, qualquer módulo do painel que use o prefixo fica sem teste.
  resolve: {
    alias: [
      { find: /^@\/(.*)$/, replacement: fileURLToPath(new URL('./web/$1', import.meta.url)) },
    ],
  },
  test: {
    include: ['scripts/**/*.test.ts', 'web/lib/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
  },
});
