import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  formatarNotificacaoEntrega,
  formatarNotificacaoMensagem,
  listarNotificacoes,
  normalizarEstadoEntrega,
  previaMensagemNotificacao,
  textoNotificacaoEntrega,
} from './notificacoes';

let dir: string;

const linha = (obj: object) => `${JSON.stringify(obj)}\n`;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'wa-notificacoes-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('formatação de notificações', () => {
  it('formata prévias de mensagem de texto e mídias variadas', () => {
    expect(previaMensagemNotificacao({ type: 'text', text: '  Bom dia, tudo certo?  ' })).toBe(
      'Bom dia, tudo certo?',
    );
    expect(previaMensagemNotificacao({ type: 'audio', text: '' })).toBe('[áudio]');
    expect(previaMensagemNotificacao({ type: 'image', text: '' })).toBe('[imagem]');
    expect(previaMensagemNotificacao({ type: 'document', text: '' })).toBe('[documento]');
  });

  it('ignora mensagens enviadas pela própria conta (fromMe: true)', () => {
    const item = formatarNotificacaoMensagem(
      {
        id: 'm1',
        timestamp: '2026-02-10T12:00:00.000Z',
        senderName: 'Você',
        type: 'text',
        text: 'Resposta interna',
        fromMe: true,
      },
      'oficina-central',
      'Oficina Central',
    );
    expect(item).toBeNull();
  });

  it('mapeia estados de entregas humanizadas (.entregas.jsonl) para textos claros', () => {
    expect(normalizarEstadoEntrega('agendado')).toBe('enfileirada');
    expect(normalizarEstadoEntrega('enfileirada')).toBe('enfileirada');
    expect(normalizarEstadoEntrega('entregando')).toBe('entregando');
    expect(normalizarEstadoEntrega('entregue')).toBe('entregue');
    expect(normalizarEstadoEntrega('interrompido', 'mensagem_nova')).toBe('interrompida');
    expect(normalizarEstadoEntrega('interrompida')).toBe('interrompida');
    expect(normalizarEstadoEntrega('interrompido', 'falha')).toBe('falhou');
    expect(normalizarEstadoEntrega('falhou')).toBe('falhou');

    expect(textoNotificacaoEntrega('entregue')).toBe('IA respondeu na conversa');
    expect(textoNotificacaoEntrega('entregue', 'Segue o orçamento atualizado')).toBe(
      'IA respondeu na conversa: Segue o orçamento atualizado',
    );
    expect(textoNotificacaoEntrega('interrompida')).toBe(
      'Entrega da IA interrompida (nova mensagem ou envio manual)',
    );
    expect(textoNotificacaoEntrega('enfileirada')).toBe('IA preparando resposta humanizada...');
    expect(textoNotificacaoEntrega('entregando')).toBe('IA preparando resposta humanizada...');
    expect(textoNotificacaoEntrega('falhou')).toBe('Falha ao entregar resposta da IA');
  });

  it('monta item de sistema a partir de evento de entrega', () => {
    const item = formatarNotificacaoEntrega(
      {
        ts: '2026-02-10T14:20:00.000Z',
        ticket: 'tck-1',
        slug: 'padaria-exemplo',
        estado: 'interrompida',
      },
      'Padaria Exemplo',
    );
    expect(item).toEqual({
      id: 'entrega:tck-1',
      tipo: 'sistema',
      slug: 'padaria-exemplo',
      chatNome: 'Padaria Exemplo',
      remetente: 'IA',
      texto: 'Entrega da IA interrompida (nova mensagem ou envio manual)',
      timestamp: '2026-02-10T14:20:00.000Z',
      estado: 'interrompida',
    });
  });
});

describe('listarNotificacoes', () => {
  it('combina mensagens recebidas e eventos de .entregas.jsonl ordenados por recência e exclui chats silenciados', async () => {
    const agoraMs = Date.parse('2026-02-10T15:00:00.000Z');

    await mkdir(join(dir, 'chat-ativo'), { recursive: true });
    await mkdir(join(dir, 'chat-silenciado'), { recursive: true });

    await writeFile(
      join(dir, '.triage.json'),
      JSON.stringify({
        muted: { 'chat-silenciado': true },
      }),
    );

    await writeFile(
      join(dir, 'chat-ativo', 'messages.jsonl'),
      linha({
        id: 'msg-antiga',
        timestamp: '2026-02-08T10:00:00.000Z', // fora da janela de 24h
        group: 'Oficina Alfa',
        groupJid: '123@g.us',
        sender: '5511999990001@s.whatsapp.net',
        senderName: 'Cliente Alfa',
        fromMe: false,
        type: 'text',
        text: 'Mensagem antiga fora da janela',
      }) +
        linha({
          id: 'msg-minha',
          timestamp: '2026-02-10T14:10:00.000Z',
          group: 'Oficina Alfa',
          groupJid: '123@g.us',
          sender: '5511999990000@s.whatsapp.net',
          senderName: 'Você',
          fromMe: true,
          type: 'text',
          text: 'Minha resposta',
        }) +
        linha({
          id: 'msg-cliente-1',
          timestamp: '2026-02-10T14:15:00.000Z',
          group: 'Oficina Alfa',
          groupJid: '123@g.us',
          sender: '5511999990001@s.whatsapp.net',
          senderName: 'Cliente Alfa',
          fromMe: false,
          type: 'audio',
          text: '',
        }),
    );

    await writeFile(
      join(dir, 'chat-silenciado', 'messages.jsonl'),
      linha({
        id: 'msg-silenciada',
        timestamp: '2026-02-10T14:50:00.000Z',
        group: 'Grupo Silenciado',
        groupJid: '999@g.us',
        sender: '5511999990002@s.whatsapp.net',
        senderName: 'Cliente Beta',
        fromMe: false,
        type: 'text',
        text: 'Não deve aparecer',
      }),
    );

    await writeFile(
      join(dir, '.entregas.jsonl'),
      linha({
        ts: '2026-02-10T14:20:00.000Z',
        ticket: 't-1',
        slug: 'chat-ativo',
        estado: 'enfileirada',
      }) +
        linha({
          ts: '2026-02-10T14:25:00.000Z',
          ticket: 't-1',
          slug: 'chat-ativo',
          estado: 'entregue',
          texto: 'Perfeito, combinado!',
        }) +
        linha({
          ts: '2026-02-10T14:30:00.000Z',
          ticket: 't-2',
          slug: 'chat-ativo',
          estado: 'falhou',
        }) +
        linha({
          ts: '2026-02-10T14:55:00.000Z',
          ticket: 't-muted',
          slug: 'chat-silenciado',
          estado: 'interrompida',
        }),
    );

    const itens = await listarNotificacoes({ dataDir: dir, agoraMs });

    expect(itens.map((i) => i.id)).toEqual(['entrega:t-2', 'entrega:t-1', 'msg-cliente-1']);
    expect(itens[0]).toMatchObject({
      tipo: 'sistema',
      slug: 'chat-ativo',
      chatNome: 'Oficina Alfa',
      texto: 'Falha ao entregar resposta da IA',
      estado: 'falhou',
    });
    expect(itens[1]).toMatchObject({
      tipo: 'sistema',
      slug: 'chat-ativo',
      chatNome: 'Oficina Alfa',
      texto: 'IA respondeu na conversa: Perfeito, combinado!',
      estado: 'entregue',
    });
    expect(itens[2]).toMatchObject({
      tipo: 'mensagem',
      slug: 'chat-ativo',
      chatNome: 'Oficina Alfa',
      remetente: 'Cliente Alfa',
      texto: '[áudio]',
    });
  });
});
