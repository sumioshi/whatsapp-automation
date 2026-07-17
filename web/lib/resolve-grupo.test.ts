import { describe, expect, it } from 'vitest';
import { type GroupRef, matchGrupo } from './resolve-grupo';

// Espelha grupos reais do groups.config.json (id+name, sem slug).
const GROUPS: GroupRef[] = [
  { id: '120363000000000003@g.us', name: 'Teste' },
  { id: '120363000000000001@g.us', name: 'Acme Corp' },
  { id: '120363000000000002@g.us', name: 'Contoso' },
];

describe('matchGrupo', () => {
  it('casa por nome EXATO', () => {
    expect(matchGrupo('Teste', GROUPS)?.id).toBe('120363000000000003@g.us');
  });

  it('casa por jid', () => {
    expect(matchGrupo('120363000000000001@g.us', GROUPS)?.name).toBe('Acme Corp');
  });

  it('casa por SLUG simples (o bug que queimava: "teste" minúsculo)', () => {
    // antes, responder({grupo:"teste"}) falhava silencioso porque o nome é "Teste"
    expect(matchGrupo('teste', GROUPS)?.id).toBe('120363000000000003@g.us');
  });

  it('casa por SLUG de nome com emoji/acento/multi-palavra (a bomba-relógio)', () => {
    // grupo real cujo nome tem emoji 🤝 — slug vira acme-corp
    expect(matchGrupo('acme-corp', GROUPS)?.id).toBe('120363000000000001@g.us');
    expect(matchGrupo('contoso', GROUPS)?.id).toBe('120363000000000002@g.us');
  });

  it('NÃO inventa destino pra grupo inexistente', () => {
    expect(matchGrupo('naoexiste-xyz', GROUPS)).toBeNull();
  });

  it('casa pelo slug PERSISTIDO quando o grupo foi renomeado', () => {
    const renamed: GroupRef[] = [
      { id: '9@g.us', name: 'Acme Corp ATÉ 16/08', slug: 'acme-corp' },
    ];
    // slug antigo (persistido) continua resolvendo…
    expect(matchGrupo('acme-corp', renamed)?.id).toBe('9@g.us');
    // …e o slug do nome NOVO também resolve (quem só viu o nome atual não fica preso)
    expect(matchGrupo('acme-corp-ate-16-08', renamed)?.id).toBe('9@g.us');
  });
});
