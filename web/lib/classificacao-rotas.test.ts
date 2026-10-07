import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CLASSIFICACAO } from './classificacao-rotas';
import { areaDoAtendente } from './equipe/politica';

const APP = fileURLToPath(new URL('../app', import.meta.url));

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? arquivos(p) : /^(route|page)\.tsx?$/.test(n) ? [relative(APP, p).split(sep).join('/')] : [];
  });
}

/** Caminho de URL de um arquivo (tira grupos "(x)", troca [param] por "x"). */
function url(arquivo: string): string {
  const partes = arquivo.split('/').slice(0, -1).filter((s) => !/^\(.*\)$/.test(s)).map((s) => (s.startsWith('[') ? 'x' : s));
  return `/${partes.join('/')}`;
}

describe('toda rota e página tem dono declarado', () => {
  const todos = arquivos(APP);
  it('nenhum arquivo sem classificação, nenhuma classificação órfã', () => {
    expect(todos.filter((f) => !(f in CLASSIFICACAO))).toEqual([]);
    expect(Object.keys(CLASSIFICACAO).filter((k) => !todos.includes(k))).toEqual([]);
  });
  it('"atendimento" bate com o que o proxy deixa o atendente alcançar', () => {
    for (const f of todos) {
      const alcanca = areaDoAtendente(url(f));
      expect([f, alcanca]).toEqual([f, CLASSIFICACAO[f] === 'atendimento']);
    }
  });
});
