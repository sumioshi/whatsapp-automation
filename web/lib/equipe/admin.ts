import { gerarSenha, hashSenha } from './senha';
import { alterarUsuarios, LOGIN_RE, publico, type Usuario, type UsuarioPublico } from './usuarios';
import { apagarVisto } from './visto';

export type Comando =
  | { acao: 'criar'; login: string; nome: string; senha?: string }
  | { acao: 'editar'; login: string; nome: string }
  | { acao: 'senha'; login: string; senha?: string }
  | { acao: 'ativo'; login: string; ativo: boolean }
  | { acao: 'chats'; login: string; chats: string[] }
  | { acao: 'apagar'; login: string };

const SLUG_RE = /^[A-Za-z0-9._-]+$/;
const SENHA_MIN = 8;

function senhaOuGerada(senha: string | undefined): { senha: string; gerada?: string } {
  if (senha === undefined || senha === '') {
    const gerada = gerarSenha();
    return { senha: gerada, gerada };
  }
  if (senha.length < SENHA_MIN) throw new Error(`senha precisa de pelo menos ${SENHA_MIN} caracteres`);
  return { senha };
}

const ACOES = new Set(['criar', 'editar', 'senha', 'ativo', 'chats', 'apagar']);

/** O corpo vem da rede: confere o formato antes de tocar em qualquer campo. */
function validarComando(c: unknown): asserts c is Comando {
  const ok = (() => {
    if (!c || typeof c !== 'object' || Array.isArray(c)) return false;
    const x = c as Record<string, unknown>;
    if (typeof x.acao !== 'string' || !ACOES.has(x.acao) || typeof x.login !== 'string') return false;
    const senhaOk = x.senha === undefined || typeof x.senha === 'string';
    switch (x.acao) {
      case 'criar':
        return typeof x.nome === 'string' && senhaOk;
      case 'editar':
        return typeof x.nome === 'string';
      case 'senha':
        return senhaOk;
      case 'ativo':
        return typeof x.ativo === 'boolean';
      case 'chats':
        return Array.isArray(x.chats) && x.chats.every((s) => typeof s === 'string');
      default:
        return true;
    }
  })();
  if (!ok) throw new Error('comando inválido');
}

/**
 * Versão inicial de uma conta: o relógio, nunca um número fixo. Um login
 * apagado e recriado não pode repetir a versão da conta anterior, senão os
 * cookies dela voltariam a valer.
 */
let ultimaVersao = 0;
function versaoInicial(): number {
  ultimaVersao = Math.max(Date.now(), ultimaVersao + 1);
  return ultimaVersao;
}

function achar(lista: Usuario[], login: string): Usuario {
  const u = lista.find((x) => x.login === login);
  if (!u) throw new Error(`conta "${login}" não existe`);
  return u;
}

export async function executar(
  c: Comando,
  donoLogin: string,
  agora = new Date(),
): Promise<{ usuario?: UsuarioPublico; senhaGerada?: string }> {
  validarComando(c);
  const login = c.login.trim().toLowerCase();

  if (c.acao === 'criar') {
    if (!LOGIN_RE.test(login)) throw new Error('login: use 2 a 32 letras minúsculas, números, ponto, hífen ou _');
    if (login === donoLogin.toLowerCase()) throw new Error('esse login é o do dono');
    const nome = c.nome.trim();
    if (!nome) throw new Error('nome é obrigatório');
    const { senha, gerada } = senhaOuGerada(c.senha);
    const hash = await hashSenha(senha);
    const usuario = await alterarUsuarios((lista) => {
      if (lista.some((u) => u.login === login)) throw new Error(`login "${login}" já existe`);
      const novo: Usuario = {
        login, nome, senha: hash, ativo: true, versao: versaoInicial(), chats: [],
        criadoEm: agora.toISOString(), ultimoAcesso: null,
      };
      lista.push(novo);
      return publico(novo);
    });
    return gerada ? { usuario, senhaGerada: gerada } : { usuario };
  }

  if (c.acao === 'senha') {
    const { senha, gerada } = senhaOuGerada(c.senha);
    const hash = await hashSenha(senha);
    const usuario = await alterarUsuarios((lista) => {
      const u = achar(lista, login);
      u.senha = hash;
      u.versao += 1;
      return publico(u);
    });
    return gerada ? { usuario, senhaGerada: gerada } : { usuario };
  }

  if (c.acao === 'apagar') {
    await alterarUsuarios((lista) => {
      const i = lista.findIndex((u) => u.login === login);
      if (i < 0) throw new Error(`conta "${login}" não existe`);
      lista.splice(i, 1);
    });
    try {
      await apagarVisto(login);
    } catch (e) {
      // A conta já saiu; o visto órfão não deve virar erro de uma remoção feita.
      console.error('apagar conta: visto não removido', e);
    }
    return {};
  }

  const usuario = await alterarUsuarios((lista) => {
    const u = achar(lista, login);
    if (c.acao === 'editar') {
      const nome = c.nome.trim();
      if (!nome) throw new Error('nome é obrigatório');
      u.nome = nome;
    } else if (c.acao === 'ativo') {
      u.ativo = c.ativo;
      u.versao += 1;
    } else {
      const chats = [...new Set(c.chats.map((s) => s.trim()).filter(Boolean))];
      const ruim = chats.find((s) => !SLUG_RE.test(s));
      if (ruim) throw new Error(`slug inválido: ${ruim}`);
      u.chats = chats;
    }
    return publico(u);
  });
  return { usuario };
}
