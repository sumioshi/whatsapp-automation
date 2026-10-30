import { NextResponse } from 'next/server';
import {
  carregarEstadoEscritorio,
  lerConfigAssentos,
  salvarConfigAssentos,
} from '@/lib/escritorio-estado';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const forceFresh = url.searchParams.get('fresh') === '1';
    const estado = await carregarEstadoEscritorio(forceFresh);
    return NextResponse.json(estado);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || 'Falha ao carregar estado do escritorio' },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      slug?: string;
      acao?:
        | 'ocupar_mesa'
        | 'liberar_mesa'
        | 'automatico'
        | 'vincular_contato'
        | 'remover_contato';
      contato?: {
        nome?: string;
        papel?: string;
        dmSlug?: string | null;
      };
    };
    const slug = body.slug?.trim();
    if (!slug || !body.acao) {
      return NextResponse.json({ error: 'slug e acao obrigatorios' }, { status: 400 });
    }

    const atual = await lerConfigAssentos();

    if (body.acao === 'vincular_contato') {
      const nome = body.contato?.nome?.trim();
      if (!nome) {
        return NextResponse.json({ error: 'nome do contato obrigatorio' }, { status: 400 });
      }
      const mapa = { ...(atual.contatosExtrasPorProjeto ?? {}) };
      const lista = [...(mapa[slug] ?? [])];
      lista.push({
        nome,
        papel: body.contato?.papel?.trim() || 'Contato',
        dmSlug: body.contato?.dmSlug?.trim() || null,
      });
      mapa[slug] = lista;
      await salvarConfigAssentos({ contatosExtrasPorProjeto: mapa });
      const estado = await carregarEstadoEscritorio();
      return NextResponse.json(estado);
    }

    if (body.acao === 'remover_contato') {
      const nome = body.contato?.nome?.trim();
      const mapa = { ...(atual.contatosExtrasPorProjeto ?? {}) };
      const lista = (mapa[slug] ?? []).filter((c) => c.nome !== nome);
      mapa[slug] = lista;
      await salvarConfigAssentos({ contatosExtrasPorProjeto: mapa });
      const estado = await carregarEstadoEscritorio();
      return NextResponse.json(estado);
    }

    const fixados = new Set(atual.fixados ?? []);
    const ocultos = new Set(atual.ocultos ?? []);

    if (body.acao === 'ocupar_mesa') {
      fixados.add(slug);
      ocultos.delete(slug);
    } else if (body.acao === 'liberar_mesa') {
      ocultos.add(slug);
      fixados.delete(slug);
    } else {
      fixados.delete(slug);
      ocultos.delete(slug);
    }

    await salvarConfigAssentos({
      fixados: Array.from(fixados),
      ocultos: Array.from(ocultos),
    });

    const estado = await carregarEstadoEscritorio();
    return NextResponse.json(estado);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || 'Falha ao atualizar mesa do projeto' },
      { status: 400 },
    );
  }
}
