import { NextResponse } from 'next/server';
import { listarNotificacoes } from '@/lib/notificacoes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/notificacoes
 * Lista inicial de notificações recentes (mensagens recebidas e atividades da
 * fila de entregas da IA nas conversas não silenciadas).
 */
export async function GET() {
  const agoraMs = Date.now();
  const itens = await listarNotificacoes({ agoraMs });
  return NextResponse.json({
    itens,
    agora: new Date(agoraMs).toISOString(),
  });
}
