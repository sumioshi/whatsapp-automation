import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { GroupConfig } from './groups';

describe('GroupConfig — slug estável por jid', () => {
  let path: string;

  beforeEach(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wac-groups-'));
    path = join(dir, 'groups.config.json');
  });

  it('primeiro sync persiste o slug derivado do nome da época', async () => {
    const cfg = new GroupConfig(path);
    await cfg.load();
    await cfg.sync([{ id: '1@g.us', name: 'Orion App 🤝 Acme' }]);

    const disk = JSON.parse(await readFile(path, 'utf8'));
    expect(disk).toEqual([
      { id: '1@g.us', name: 'Orion App 🤝 Acme', watch: false, slug: 'orion-app-projeto-185-ai' },
    ]);
  });

  it('rename atualiza o name mas MANTÉM o slug (identidade, não apelido)', async () => {
    const cfg = new GroupConfig(path);
    await cfg.load();
    await cfg.sync([{ id: '1@g.us', name: 'Orion App 🤝 Acme' }]);
    await cfg.sync([{ id: '1@g.us', name: 'Orion App 🤝 Acme TERMINA EM 16/08/2026' }]);

    const disk = JSON.parse(await readFile(path, 'utf8'));
    expect(disk[0].name).toBe('Orion App 🤝 Acme TERMINA EM 16/08/2026');
    expect(disk[0].slug).toBe('orion-app-projeto-185-ai');
    expect(cfg.slugOf('1@g.us')).toBe('orion-app-projeto-185-ai');
  });

  it('config legado (sem slug) ganha slug do nome que está no arquivo, não do novo', async () => {
    await writeFile(
      path,
      `${JSON.stringify([{ id: '1@g.us', name: 'Nome Antigo', watch: true }], null, 2)}\n`,
    );
    const cfg = new GroupConfig(path);
    await cfg.load();
    await cfg.sync([{ id: '1@g.us', name: 'Nome Novo' }]);

    const disk = JSON.parse(await readFile(path, 'utf8'));
    expect(disk[0]).toEqual({ id: '1@g.us', name: 'Nome Novo', watch: true, slug: 'nome-antigo' });
  });

  it('sync preserva watch e slugMap expõe jid→slug', async () => {
    const cfg = new GroupConfig(path);
    await cfg.load();
    await cfg.sync([
      { id: '1@g.us', name: 'Grupo Um' },
      { id: '2@g.us', name: 'Grupo Dois' },
    ]);
    // liga watch editando o arquivo (como o painel faz) e recarrega
    const disk = JSON.parse(await readFile(path, 'utf8'));
    disk[disk.findIndex((e: { id: string }) => e.id === '1@g.us')].watch = true;
    await writeFile(path, JSON.stringify(disk));
    await cfg.load();
    await cfg.sync([{ id: '1@g.us', name: 'Grupo Um Renomeado' }]);

    expect(cfg.isWatched('1@g.us')).toBe(true);
    expect(Object.fromEntries(cfg.slugMap())).toEqual({
      '1@g.us': 'grupo-um',
      '2@g.us': 'grupo-dois',
    });
  });
});
