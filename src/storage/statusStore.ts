import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export type ConnectionState = 'open' | 'connecting' | 'qr' | 'close' | 'unknown';

export interface CollectorStatus {
  connection: ConnectionState;
  /** String do QR para o painel renderizar; null quando não há pareamento pendente. */
  qr: string | null;
  watchedCount: number;
  updatedAt: string;
}

/**
 * Publica o estado do coletor em `<dataDir>/.collector-status.json`.
 * O painel lê esse arquivo para mostrar conexão e QR no navegador.
 */
export class StatusStore {
  private readonly path: string;
  private connection: ConnectionState = 'unknown';
  private qr: string | null = null;
  private watchedCount = 0;

  constructor(dataDir: string) {
    this.path = join(dataDir, '.collector-status.json');
  }

  async setConnection(connection: string | undefined, qr: string | null): Promise<void> {
    this.qr = qr;
    if (qr) this.connection = 'qr';
    else if (connection === 'open') this.connection = 'open';
    else if (connection === 'connecting') this.connection = 'connecting';
    else if (connection === 'close') this.connection = 'close';
    await this.flush();
  }

  async setWatchedCount(count: number): Promise<void> {
    this.watchedCount = count;
    await this.flush();
  }

  private async flush(): Promise<void> {
    const status: CollectorStatus = {
      connection: this.connection,
      qr: this.qr,
      watchedCount: this.watchedCount,
      updatedAt: new Date().toISOString(),
    };
    await writeFile(this.path, JSON.stringify(status, null, 2), 'utf8');
  }
}
