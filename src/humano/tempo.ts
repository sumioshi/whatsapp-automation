/**
 * Sleep abortável: resolve no timeout OU na hora em que o sinal aborta — quem
 * chama decide o que fazer (o executor da entrega checa `signal.aborted` e para).
 * Não rejeita: cancelar entrega é fluxo normal, não erro.
 */
export function dormir(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      resolve();
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
