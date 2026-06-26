import { describe, expect, it } from 'vitest';
import { mergeDedupLines, mergeMessagesById } from './jsonl-merge';

describe('mergeMessagesById', () => {
  it('une por id, ordena por timestamp, sem duplicar', () => {
    const local = JSON.stringify({ id: 'A', timestamp: '2026-06-23T10:00:00.000Z', text: 'oi' }) + '\n';
    const remote =
      JSON.stringify({ id: 'A', timestamp: '2026-06-23T10:00:00.000Z', text: 'oi' }) + '\n' +
      JSON.stringify({ id: 'B', timestamp: '2026-06-23T09:00:00.000Z', text: 'antes' }) + '\n';
    const out = mergeMessagesById(local, remote).trim().split('\n');
    expect(out).toHaveLength(2); // A não duplica
    expect(out[0]).toContain('"id":"B"'); // 09h vem antes
    expect(out[1]).toContain('"id":"A"');
  });

  it('idempotente', () => {
    const a = JSON.stringify({ id: 'A', timestamp: '2026-06-23T10:00:00.000Z' }) + '\n';
    const once = mergeMessagesById(a, '');
    expect(mergeMessagesById(once, '')).toBe(once);
  });

  it('ignora linha sem id ou inválida', () => {
    expect(mergeMessagesById('{"timestamp":"t"}\nnão-json\n', '').trim()).toBe('');
  });
});

describe('mergeDedupLines', () => {
  it('remove repetidas, preserva ordem', () => {
    const out = mergeDedupLines('{"x":1}\n{"x":2}\n', '{"x":2}\n{"x":3}\n').trim().split('\n');
    expect(out).toEqual(['{"x":1}', '{"x":2}', '{"x":3}']);
  });
});
