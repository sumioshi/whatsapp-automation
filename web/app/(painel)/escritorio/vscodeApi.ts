interface VsCodeMessage {
  type?: string;
  layout?: unknown;
  seats?: unknown;
  [key: string]: unknown;
}

export const vscode = {
  postMessage(msg: unknown): void {
    if (!msg || typeof msg !== 'object') return;
    const payload = msg as VsCodeMessage;
    if (payload.type === 'saveLayout' && payload.layout) {
      fetch('/api/escritorio/layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layout: payload.layout }),
      }).catch(() => {});
    } else if (payload.type === 'saveAgentSeats' && payload.seats) {
      fetch('/api/escritorio/layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seats: payload.seats }),
      }).catch(() => {});
    }
  },
};
