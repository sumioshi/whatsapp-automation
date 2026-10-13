import { describe, expect, it } from 'vitest';
import {
  agruparReacoes,
  autoria,
  type ConversaFila,
  continuaSequencia,
  desdeQuando,
  dividirPrevia,
  type EsperaFila,
  horaCurta,
  ligarEntregas,
  midiaDaConversa,
  rotuloDosBaloes,
  montarFila,
  pessoasDaConversa,
  quandoCurto,
  resumoContrato,
  rotuloDia,
  rotuloEstadoIa,
  rotuloSinal,
} from './caixa';

const conversa = (slug: string, extra: Partial<ConversaFila> = {}): ConversaFila => ({
  slug,
  nome: slug,
  avatarPath: null,
  previa: null,
  ultimaEm: null,
  naoLidas: 0,
  fixada: false,
  silenciada: false,
  arquivada: false,
  etiquetas: [],
  ...extra,
});

const espera = (slug: string, desde: string, extra: Partial<EsperaFila> = {}): EsperaFila => ({
  slug,
  nome: slug,
  motivo: 'client-waiting',
  de: 'Carla',
  previa: 'oi',
  desde,
  ...extra,
});

describe('montarFila', () => {
  const conversas = [
    conversa('norte', { nome: 'Norte Logística', etiquetas: ['Bug'], naoLidas: 3, previa: 'Carla: relatório zerado' }),
    conversa('ebano', { nome: 'Clínica Ébano', etiquetas: ['Contrato'] }),
    conversa('lume', { nome: 'Lume Odonto', previa: 'Você: Já ajustei o horário' }),
    conversa('mare', { nome: 'Maré Surf School' }),
    conversa('fixa', { nome: 'Fixa', fixada: true }),
    conversa('velha', { nome: 'Velha', arquivada: true }),
    conversa('solta', { nome: 'Solta' }),
  ];
  const esperando = [
    espera('norte', '2026-10-06T10:00:00Z', { nome: 'Norte Logística' }),
    espera('ebano', '2026-10-07T09:00:00Z', { motivo: 'mentioned', de: 'Dr. Paulo', previa: 'E o lembrete?' }),
    espera('lume', '2026-10-07T09:30:00Z'),
  ];
  const entregas = [
    { ticket: 't1', slug: 'lume', estado: 'entregando', enviados: 0, total: 2, entregarEm: '2026-10-07T09:40:00Z' },
  ];
  const aguardandoOk = [{ slug: 'mare', n: 4, texto: 'Rascunho pronto', desde: '2026-10-07T08:00:00Z' }];

  it('Esperando mostra só quem espera e não está com a IA, mais antigo primeiro', () => {
    const f = montarFila({ esperando, conversas, entregas, aguardandoOk }, { vista: 'esperando' });
    expect(f.secoes.map((s) => s.id)).toEqual(['esperando']);
    expect(f.secoes[0]?.linhas.map((l) => l.slug)).toEqual(['norte', 'ebano']);
    expect(f.contagens).toEqual({ esperando: 2, ia: 2 });
    expect(f.abertas).toBe(4);
  });

  it('linha de espera traz etiqueta, menção, prévia e não lidas da conversa', () => {
    const f = montarFila({ esperando, conversas, entregas, aguardandoOk }, { vista: 'esperando' });
    const [norte, ebano] = f.secoes[0]?.linhas ?? [];
    expect(norte).toMatchObject({ nome: 'Norte Logística', etiqueta: 'Bug', mencao: false, naoLidas: 3 });
    expect(norte?.esperaDesde).toBe('2026-10-06T10:00:00Z');
    expect(norte?.previa).toEqual({ de: 'Carla', texto: 'oi' });
    expect(ebano).toMatchObject({ mencao: true, etiqueta: 'Contrato' });
  });

  it('Com a IA junta entregas vivas e perguntas esperando o OK', () => {
    const f = montarFila({ esperando, conversas, entregas, aguardandoOk }, { vista: 'ia' });
    expect(f.secoes.map((s) => s.id)).toEqual(['ia']);
    const [lume, mare] = f.secoes[0]?.linhas ?? [];
    expect(lume?.ia).toEqual({ tipo: 'entregando', atual: 1, total: 2, enviados: 0 });
    expect(lume?.previa).toEqual({ de: 'Você', texto: 'Já ajustei o horário' });
    expect(mare?.ia).toEqual({ tipo: 'ok', n: 4 });
    expect(mare?.previa).toEqual({ de: 'IA', texto: 'Rascunho pronto' });
  });

  it('Todas mostra cada conversa uma vez, nas seções em ordem, com arquivadas recolhidas', () => {
    const f = montarFila({ esperando, conversas, entregas, aguardandoOk }, { vista: 'todas' });
    expect(f.secoes.map((s) => [s.id, s.linhas.map((l) => l.slug)])).toEqual([
      ['esperando', ['norte', 'ebano']],
      ['ia', ['lume', 'mare']],
      ['fixadas', ['fixa']],
      ['conversas', ['solta']],
      ['arquivadas', []],
    ]);
    expect(f.secoes.at(-1)).toMatchObject({ recolhida: true, total: 1 });
    expect(f.ordem).toEqual(['norte', 'ebano', 'lume', 'mare', 'fixa', 'solta']);
  });

  it('arquivadas abrem quando pedidas', () => {
    const f = montarFila({ esperando, conversas, entregas, aguardandoOk }, { vista: 'todas', arquivadasAbertas: true });
    expect(f.secoes.at(-1)).toMatchObject({ recolhida: false, linhas: [expect.objectContaining({ slug: 'velha' })] });
    expect(f.ordem.at(-1)).toBe('velha');
  });

  it('filtro casa nome ou etiqueta sem acento nem caixa, e abre as arquivadas', () => {
    const porNome = montarFila({ esperando, conversas, entregas, aguardandoOk }, { vista: 'todas', filtro: 'clinica' });
    expect(porNome.ordem).toEqual(['ebano']);
    const porEtiqueta = montarFila({ esperando, conversas, entregas, aguardandoOk }, { vista: 'esperando', filtro: 'BUG' });
    expect(porEtiqueta.ordem).toEqual(['norte']);
    const arquivada = montarFila({ esperando, conversas, entregas, aguardandoOk }, { vista: 'todas', filtro: 'velh' });
    expect(arquivada.secoes.map((s) => s.id)).toEqual(['arquivadas']);
    expect(arquivada.ordem).toEqual(['velha']);
  });

  it('contagens não dependem do filtro', () => {
    const f = montarFila({ esperando, conversas, entregas, aguardandoOk }, { vista: 'esperando', filtro: 'nada disso' });
    expect(f.contagens).toEqual({ esperando: 2, ia: 2 });
    expect(f.secoes[0]?.linhas).toEqual([]);
  });

  it('espera de chat fora da lista usa o nome que veio com ela', () => {
    const f = montarFila(
      { esperando: [espera('dm-1', '2026-10-07T09:00:00Z', { nome: 'Lia' })], conversas: [], entregas: [], aguardandoOk: [] },
      { vista: 'esperando' },
    );
    expect(f.secoes[0]?.linhas[0]).toMatchObject({ slug: 'dm-1', nome: 'Lia', tipo: 'dm' });
  });

  it('entrega agendada mostra a hora de Brasília e vem depois das que estão saindo', () => {
    const f = montarFila(
      {
        esperando: [],
        conversas: [conversa('a'), conversa('b')],
        entregas: [
          { ticket: 'x', slug: 'a', estado: 'agendado', enviados: 0, total: 1, entregarEm: '2026-10-07T18:40:00Z' },
          { ticket: 'y', slug: 'b', estado: 'entregando', enviados: 1, total: 3, entregarEm: '2026-10-07T18:00:00Z' },
        ],
        aguardandoOk: [],
      },
      { vista: 'ia' },
    );
    expect(f.secoes[0]?.linhas.map((l) => [l.slug, l.ia])).toEqual([
      ['b', { tipo: 'entregando', atual: 2, total: 3, enviados: 1 }],
      ['a', { tipo: 'agendado', hora: '15:40' }],
    ]);
  });

  it('pergunta antiga demais não prende a conversa em Com a IA', () => {
    const f = montarFila(
      { esperando: [espera('mare', '2026-10-07T09:00:00Z')], conversas: [conversa('mare')], entregas: [], aguardandoOk: [{ slug: 'mare', n: 1, texto: 'x', desde: '2026-09-01T00:00:00Z' }] },
      { vista: 'esperando', agoraMs: Date.parse('2026-10-07T12:00:00Z') },
    );
    expect(f.contagens).toEqual({ esperando: 1, ia: 0 });
  });
});

describe('rotuloEstadoIa', () => {
  it('descreve cada estado em poucas palavras', () => {
    expect(rotuloEstadoIa({ tipo: 'entregando', atual: 1, total: 2, enviados: 0 })).toBe('entregando 1/2');
    expect(rotuloEstadoIa({ tipo: 'agendado', hora: '15:40' })).toBe('agendado 15:40');
    expect(rotuloEstadoIa({ tipo: 'ok', n: 4 })).toBe('espera seu OK');
  });
});

describe('dividirPrevia', () => {
  it('separa quem falou do texto e tira os colchetes da mídia', () => {
    expect(dividirPrevia('Carla: O relatório veio zerado')).toEqual({ de: 'Carla', texto: 'O relatório veio zerado' });
    expect(dividirPrevia('Renato: [áudio]')).toEqual({ de: 'Renato', texto: 'áudio' });
    expect(dividirPrevia('sem autor')).toEqual({ de: null, texto: 'sem autor' });
    expect(dividirPrevia(null)).toBeNull();
  });
});

describe('autoria', () => {
  it('recebida não tem autoria própria', () => {
    expect(autoria({ fromMe: false }, 'dono')).toBeNull();
  });
  it('separa celular, web, painel, equipe, IA e IA da Meta', () => {
    expect(autoria({ fromMe: true, origem: 'celular' }, 'dono')).toEqual({ id: 'celular', quem: 'Você', via: 'pelo celular' });
    expect(autoria({ fromMe: true, origem: 'web' }, 'dono')).toEqual({ id: 'web', quem: 'Você', via: 'pelo WhatsApp Web' });
    expect(autoria({ fromMe: true, origem: 'coletor', ator: 'painel', usuario: 'dono' }, 'dono')).toEqual({
      id: 'painel',
      quem: 'Você',
      via: 'pelo painel',
    });
    expect(autoria({ fromMe: true, origem: 'coletor', ator: 'painel', usuario: 'ana' }, 'dono')).toEqual({
      id: 'equipe',
      quem: 'ana',
      via: 'pelo painel',
    });
    expect(autoria({ fromMe: true, origem: 'coletor' }, 'dono')).toEqual({ id: 'ia', quem: 'IA', via: 'pelo agente' });
    expect(autoria({ fromMe: true, origem: 'ia_meta' }, 'dono')).toEqual({ id: 'meta', quem: 'IA da Meta', via: 'em nome da conta' });
    expect(autoria({ fromMe: true }, null)).toEqual({ id: 'voce', quem: 'Você', via: null });
  });
});

describe('continuaSequencia', () => {
  const m = (sender: string, timestamp: string, extra: Record<string, unknown> = {}) => ({ sender, timestamp, type: 'text', ...extra });
  it('mesma pessoa em menos de 5 min no mesmo dia continua o bloco', () => {
    expect(continuaSequencia(m('a', '2026-10-07T12:00:00Z'), m('a', '2026-10-07T12:04:00Z'), null)).toBe(true);
    expect(continuaSequencia(m('a', '2026-10-07T12:00:00Z'), m('a', '2026-10-07T12:06:00Z'), null)).toBe(false);
    expect(continuaSequencia(m('a', '2026-10-07T12:00:00Z'), m('b', '2026-10-07T12:01:00Z'), null)).toBe(false);
  });
  it('vira o dia em Brasília, quebra o bloco', () => {
    expect(continuaSequencia(m('a', '2026-10-08T02:58:00Z'), m('a', '2026-10-08T03:01:00Z'), null)).toBe(false);
  });
  it('mensagens próprias só continuam com a mesma autoria', () => {
    const celular = m('eu', '2026-10-07T12:00:00Z', { fromMe: true, origem: 'celular' });
    const ia = m('eu', '2026-10-07T12:01:00Z', { fromMe: true, origem: 'coletor' });
    expect(continuaSequencia(celular, ia, null)).toBe(false);
    expect(continuaSequencia(ia, { ...ia, timestamp: '2026-10-07T12:02:00Z' }, null)).toBe(true);
  });
  it('chamada nunca agrupa', () => {
    expect(continuaSequencia(m('a', '2026-10-07T12:00:00Z', { type: 'call' }), m('a', '2026-10-07T12:01:00Z'), null)).toBe(false);
  });
});

describe('agruparReacoes', () => {
  it('soma por emoji na ordem em que apareceram e lista quem reagiu', () => {
    expect(
      agruparReacoes([
        { emoji: '👍', by: 'Ana', fromMe: false },
        { emoji: '❤️', by: 'Bia', fromMe: false },
        { emoji: '👍', by: 'eu', fromMe: true },
      ]),
    ).toEqual([
      { emoji: '👍', n: 2, quem: ['Ana', 'você'] },
      { emoji: '❤️', n: 1, quem: ['Bia'] },
    ]);
  });
});

describe('pessoasDaConversa', () => {
  const r = (sender: string, senderName: string, timestamp: string, fromMe = false) => ({ sender, senderName, timestamp, fromMe });
  it('conta quem escreveu (menos a própria conta), mais ativo primeiro', () => {
    const pessoas = pessoasDaConversa(
      [
        r('1@s', 'Paulo', '2026-10-01T10:00:00Z'),
        r('2@s', 'Juliana', '2026-10-02T10:00:00Z'),
        r('1@s', 'Paulo', '2026-10-03T10:00:00Z'),
        r('9@s', 'Eu', '2026-10-03T11:00:00Z', true),
        r('3@s', 'Ana', '2026-10-04T10:00:00Z'),
      ],
      { papel: (id) => (id === '3' ? 'team' : 'client'), nome: (n) => n },
    );
    expect(pessoas).toEqual([
      { id: '1', nome: 'Paulo', papel: 'client', mensagens: 2, ultimaEm: '2026-10-03T10:00:00Z' },
      { id: '3', nome: 'Ana', papel: 'team', mensagens: 1, ultimaEm: '2026-10-04T10:00:00Z' },
      { id: '2', nome: 'Juliana', papel: 'client', mensagens: 1, ultimaEm: '2026-10-02T10:00:00Z' },
    ]);
  });
});

describe('midiaDaConversa', () => {
  it('conta a mídia e devolve as mais recentes primeiro', () => {
    const m = (id: string, type: string, mediaPath: string | null) => ({ id, type, mediaPath, timestamp: `2026-10-0${id}T10:00:00Z` });
    const r = midiaDaConversa([m('1', 'image', 'a/1.jpg'), m('2', 'text', null), m('3', 'audio', 'a/3.ogg'), m('4', 'document', 'a/4.pdf')], 2);
    expect(r.total).toBe(3);
    expect(r.recentes.map((x) => x.id)).toEqual(['4', '3']);
  });
});

describe('resumoContrato', () => {
  const base = { estado: 'ativo' as const, inicio: '2025-03-10', fim: '2026-10-30', valorMensal: 1800, nota: '' };
  it('monta estado, valor, início e renovação', () => {
    expect(resumoContrato(base, '2026-10-07')).toEqual({
      estado: { rotulo: 'ativo', tom: 'ok' },
      valor: 'Mensal · R$ 1.800',
      inicio: 'mar 2025',
      renova: '30 out, em 23 dias',
    });
  });
  it('fala de vencido, hoje e amanhã', () => {
    expect(resumoContrato({ ...base, fim: '2026-10-04' }, '2026-10-07').renova).toBe('4 out, venceu há 3 dias');
    expect(resumoContrato({ ...base, fim: '2026-10-07' }, '2026-10-07').renova).toBe('7 out, vence hoje');
    expect(resumoContrato({ ...base, fim: '2026-10-08' }, '2026-10-07').renova).toBe('8 out, amanhã');
  });
  it('sem contrato e valores quebrados', () => {
    expect(resumoContrato(null, '2026-10-07')).toEqual({ estado: { rotulo: 'sem contrato', tom: 'neutro' }, valor: null, inicio: null, renova: null });
    expect(resumoContrato({ ...base, estado: 'pausado', valorMensal: 1234.5 }, '2026-10-07')).toMatchObject({
      estado: { rotulo: 'pausado', tom: 'warn' },
      valor: 'Mensal · R$ 1.234,50',
    });
  });
});

describe('rotuloSinal', () => {
  it('encurta o sinal do painel para caber num chip', () => {
    expect(rotuloSinal('sem-contrato-ativo', null, '2026-10-07')).toEqual({ texto: 'ativo sem contrato', tom: 'warn' });
    expect(rotuloSinal('encerrado-ativo', null, '2026-10-07')).toEqual({ texto: 'contrato encerrado', tom: 'danger' });
    expect(rotuloSinal('sem-entrega-30d', null, '2026-10-07')).toEqual({ texto: 'sem entrega há 30 dias', tom: 'warn' });
    expect(rotuloSinal('pausado-ativo', null, '2026-10-07')).toEqual({ texto: 'pausado, mas ativo', tom: 'warn' });
    const c = { estado: 'ativo' as const, inicio: null, fim: '2026-10-30', valorMensal: null, nota: '' };
    expect(rotuloSinal('renovacao-30d', c, '2026-10-07')).toEqual({ texto: 'renova em 23 dias', tom: 'neutro' });
  });
});

describe('desdeQuando', () => {
  it('usa o início do contrato e cai para a primeira mensagem', () => {
    expect(desdeQuando({ estado: 'ativo', inicio: '2025-03-10', fim: null, valorMensal: null, nota: '' }, '2024-01-01T00:00:00Z')).toBe(
      'cliente desde mar 2025',
    );
    expect(desdeQuando(null, '2026-08-01T12:00:00Z')).toBe('conversa desde ago 2026');
    expect(desdeQuando(null, null)).toBeNull();
  });
});

describe('datas em Brasília', () => {
  const agora = Date.parse('2026-10-07T18:00:00Z');
  it('hora curta e quando curto', () => {
    expect(horaCurta('2026-10-07T18:40:00Z')).toBe('15:40');
    expect(quandoCurto('2026-10-07T13:05:00Z', agora)).toBe('10:05');
    expect(quandoCurto('2026-10-06T13:05:00Z', agora)).toBe('ontem');
    expect(quandoCurto('2026-09-20T13:05:00Z', agora)).toBe('20/09');
    expect(quandoCurto('2025-09-20T13:05:00Z', agora)).toBe('20/09/25');
    expect(quandoCurto(null, agora)).toBe('');
  });
  it('rótulo do separador de dia', () => {
    expect(rotuloDia('2026-10-07T12:00:00Z', agora)).toBe('hoje');
    expect(rotuloDia('2026-10-06T12:00:00Z', agora)).toBe('ontem');
    expect(rotuloDia('2026-08-12T12:00:00Z', agora)).toBe('12 de agosto');
    expect(rotuloDia('2025-08-12T12:00:00Z', agora)).toBe('12 de agosto de 2025');
  });
});

describe('ligarEntregas', () => {
  const ia = (id: string, timestamp: string) => ({ id, timestamp, fromMe: true, origem: 'coletor' });
  const ev = (ticket: string, estado: string, ts: string, extra: Record<string, unknown> = {}) => ({
    ts,
    ticket,
    slug: 'g',
    estado,
    motivo: null,
    enviados: 0,
    total: 3,
    iniciadoEm: null,
    ...extra,
  });

  it('numera os balões da IA dentro da janela da entrega', () => {
    const r = ligarEntregas(
      [
        { id: 'c1', timestamp: '2026-10-07T12:00:30Z', fromMe: false },
        ia('a', '2026-10-07T12:00:10Z'),
        ia('b', '2026-10-07T12:00:25Z'),
        ia('c', '2026-10-07T12:00:40Z'),
        ia('depois', '2026-10-07T13:00:00Z'),
      ],
      [
        ev('t1', 'agendado', '2026-10-07T11:59:00Z'),
        ev('t1', 'entregando', '2026-10-07T12:00:00Z', { iniciadoEm: '2026-10-07T12:00:00Z' }),
        ev('t1', 'entregue', '2026-10-07T12:00:41Z', { enviados: 3 }),
      ],
      Date.parse('2026-10-07T14:00:00Z'),
    );
    expect(r.baloes).toEqual({
      a: { ticket: 't1', n: 1, total: 3 },
      b: { ticket: 't1', n: 2, total: 3 },
      c: { ticket: 't1', n: 3, total: 3 },
    });
    expect(r.avisos).toEqual([]);
  });

  it('mensagem do painel ou do celular nunca vira balão da IA', () => {
    const r = ligarEntregas(
      [
        { id: 'p', timestamp: '2026-10-07T12:00:10Z', fromMe: true, origem: 'coletor', ator: 'painel' },
        { id: 'cel', timestamp: '2026-10-07T12:00:12Z', fromMe: true, origem: 'celular' },
        ia('a', '2026-10-07T12:00:20Z'),
      ],
      [
        ev('t1', 'entregando', '2026-10-07T12:00:00Z', { iniciadoEm: '2026-10-07T12:00:00Z', total: 1 }),
        ev('t1', 'entregue', '2026-10-07T12:00:21Z', { enviados: 1, total: 1 }),
      ],
      Date.parse('2026-10-07T14:00:00Z'),
    );
    expect(Object.keys(r.baloes)).toEqual(['a']);
  });

  it('entrega interrompida vira aviso com o que não saiu', () => {
    const r = ligarEntregas(
      [ia('a', '2026-10-07T12:00:10Z')],
      [
        ev('t1', 'entregando', '2026-10-07T12:00:00Z', { iniciadoEm: '2026-10-07T12:00:00Z' }),
        ev('t1', 'interrompido', '2026-10-07T12:00:20Z', { motivo: 'mensagem_nova', enviados: 1 }),
        ev('t2', 'entregando', '2026-10-07T13:00:00Z', { iniciadoEm: '2026-10-07T13:00:00Z', total: 2 }),
        ev('t2', 'interrompido', '2026-10-07T13:00:05Z', { motivo: 'operador_respondeu', enviados: 0, total: 2 }),
        ev('t3', 'entregando', '2026-10-07T14:00:00Z', { iniciadoEm: '2026-10-07T14:00:00Z', total: 1 }),
        ev('t3', 'cancelado', '2026-10-07T14:00:02Z', { motivo: 'operador', enviados: 0, total: 1 }),
      ],
      Date.parse('2026-10-07T15:00:00Z'),
    );
    expect(r.baloes).toEqual({ a: { ticket: 't1', n: 1, total: 3 } });
    expect(r.avisos).toEqual([
      { ts: '2026-10-07T12:00:20Z', ticket: 't1', texto: 'Entrega interrompida: chegou mensagem nova antes do 2º balão. Os outros 2 não saíram.' },
      { ts: '2026-10-07T13:00:05Z', ticket: 't2', texto: 'Entrega interrompida: você respondeu antes do 1º balão. Os 2 balões não saíram.' },
      { ts: '2026-10-07T14:00:02Z', ticket: 't3', texto: 'Entrega cancelada antes do 1º balão. Nada saiu.' },
    ]);
  });

  it('troca por resposta nova sem nada enviado não vira aviso', () => {
    const r = ligarEntregas(
      [],
      [ev('t1', 'cancelado', '2026-10-07T12:00:20Z', { motivo: 'substituido', enviados: 0 })],
      Date.parse('2026-10-07T15:00:00Z'),
    );
    expect(r.avisos).toEqual([]);
  });

  it('entrega ainda saindo numera o que já chegou', () => {
    const r = ligarEntregas(
      [ia('a', '2026-10-07T12:00:10Z')],
      [ev('t1', 'entregando', '2026-10-07T12:00:00Z', { iniciadoEm: '2026-10-07T12:00:00Z', total: 2 })],
      Date.parse('2026-10-07T12:00:30Z'),
    );
    expect(r.baloes).toEqual({ a: { ticket: 't1', n: 1, total: 2 } });
  });
});

describe('rotuloDosBaloes', () => {
  const b = (n: number, total: number) => ({ ticket: 't', n, total });
  it('um balão diz qual é; vários seguidos viram faixa', () => {
    expect(rotuloDosBaloes([b(1, 3)])).toBe('1 de 3 balões');
    expect(rotuloDosBaloes([b(1, 3), b(2, 3), b(3, 3)])).toBe('1–3 de 3 balões');
    expect(rotuloDosBaloes([b(2, 3), b(3, 3)])).toBe('2–3 de 3 balões');
    expect(rotuloDosBaloes([b(1, 1)])).toBe('1 balão');
    expect(rotuloDosBaloes([])).toBe('');
  });
});
