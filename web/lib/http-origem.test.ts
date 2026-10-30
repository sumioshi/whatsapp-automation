import { describe, expect, it } from 'vitest';
import { corpoEhJson, origemDoProprioSite } from './http-origem';

const h = (o: Record<string, string>) => new Headers(o);

describe('origemDoProprioSite', () => {
  it('aceita a própria tela, navegação direta e clientes sem Sec-Fetch (relay, curl)', () => {
    expect(origemDoProprioSite(h({ 'sec-fetch-site': 'same-origin' }))).toBe(true);
    expect(origemDoProprioSite(h({ 'sec-fetch-site': 'none' }))).toBe(true);
    expect(origemDoProprioSite(h({}))).toBe(true);
  });
  it('recusa outro site e outro subdomínio', () => {
    expect(origemDoProprioSite(h({ 'sec-fetch-site': 'cross-site' }))).toBe(false);
    expect(origemDoProprioSite(h({ 'sec-fetch-site': 'same-site' }))).toBe(false);
  });
});

describe('corpoEhJson', () => {
  it('só application/json, com ou sem charset', () => {
    expect(corpoEhJson(h({ 'content-type': 'application/json' }))).toBe(true);
    expect(corpoEhJson(h({ 'content-type': 'Application/JSON; charset=utf-8' }))).toBe(true);
    expect(corpoEhJson(h({ 'content-type': 'text/plain' }))).toBe(false);
    expect(corpoEhJson(h({}))).toBe(false);
  });
});
