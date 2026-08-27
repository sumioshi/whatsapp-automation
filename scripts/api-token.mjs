#!/usr/bin/env node
/**
 * Gera, lista e revoga tokens da API v1.
 *
 * O token cru aparece UMA vez, na criação: o arquivo guarda só o sha256, então
 * um vazamento do volume não entrega credencial utilizável.
 *
 *   node scripts/api-token.mjs criar <nome> [--escopos read,write]
 *   node scripts/api-token.mjs listar
 *   node scripts/api-token.mjs revogar <id>
 */
import { randomBytes, createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const DATA_DIR = process.env.WAC_DATA_DIR ?? process.env.DATA_DIR ?? 'data';
const ARQUIVO = join(DATA_DIR, 'api-tokens.json');

async function ler() {
  try {
    return JSON.parse(await readFile(ARQUIVO, 'utf8'));
  } catch {
    return { tokens: [] };
  }
}

async function gravar(dados) {
  await mkdir(dirname(ARQUIVO), { recursive: true });
  await writeFile(ARQUIVO, JSON.stringify(dados, null, 2) + '\n');
}

const [, , comando, arg, ...resto] = process.argv;

if (comando === 'criar') {
  if (!arg) {
    console.error('uso: node scripts/api-token.mjs criar <nome> [--escopos read,write]');
    process.exit(1);
  }
  const flag = resto.indexOf('--escopos');
  const escopos = flag >= 0 ? (resto[flag + 1] ?? 'read').split(',') : ['read'];
  const invalido = escopos.find((e) => e !== 'read' && e !== 'write');
  if (invalido) {
    console.error(`escopo inválido: ${invalido} (use read e/ou write)`);
    process.exit(1);
  }
  const cru = `wac_${randomBytes(32).toString('base64url')}`;
  const dados = await ler();
  const registro = {
    id: `tk_${randomBytes(6).toString('hex')}`,
    nome: arg,
    hash: createHash('sha256').update(cru, 'utf8').digest('hex'),
    escopos,
    criadoEm: new Date().toISOString(),
    revogadoEm: null,
  };
  dados.tokens.push(registro);
  await gravar(dados);
  console.log(`\ntoken criado: ${registro.id} (${arg}) escopos=${escopos.join(',')}`);
  console.log('guarde agora, não dá pra recuperar depois:\n');
  console.log(`  ${cru}\n`);
} else if (comando === 'listar') {
  const { tokens } = await ler();
  if (!tokens.length) {
    console.log('nenhum token');
  } else {
    for (const t of tokens) {
      const estado = t.revogadoEm ? `revogado em ${t.revogadoEm}` : 'ativo';
      console.log(`  ${t.id}  ${t.nome.padEnd(20)} ${t.escopos.join(',').padEnd(11)} ${estado}`);
    }
  }
} else if (comando === 'revogar') {
  const dados = await ler();
  const alvo = dados.tokens.find((t) => t.id === arg);
  if (!alvo) {
    console.error(`token ${arg} não encontrado`);
    process.exit(1);
  }
  alvo.revogadoEm = new Date().toISOString();
  await gravar(dados);
  console.log(`${arg} revogado (vale em até 10s, o cache expira)`);
} else {
  console.log('comandos: criar <nome> [--escopos read,write] | listar | revogar <id>');
}
