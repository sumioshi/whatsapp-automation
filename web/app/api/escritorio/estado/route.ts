import { NextResponse } from 'next/server';
import {
  carregarEstadoEscritorio,
  lerConfigAssentos,
  salvarConfigAssentos,
} from '@/lib/escritorio-estado';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const estado = await carregarEstadoEscritorio();
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
      acao?: 'ocupar_mesa' | 'liberar_mesa' | 'automatico';
    };
    const slug = body.slug?.trim();
    if (!slug || !body.acao) {
      return NextResponse.json({ error: 'slug e acao obrigatorios' }, { status: 400 });
    }

    const atual = await lerConfigAssentos();
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
