import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  consumePendingAndSaveResults,
  enqueueRemoteOrcaCommand,
  executeLocalOrcaCommand,
  getOrcaBin,
  getOrcaSnapshot,
  lerWatchAtivo,
  type OrcaCommandResult,
  type OrcaPendingCommand,
  type OrcaSnapshot,
  readLocalTerminalScreen,
  readRemoteQueue,
  saveSyncedOrcaSnapshot,
} from '@/lib/orca-bridge';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get('slug');
    const terminalParam = searchParams.get('terminal');
    const wantScreen = searchParams.get('screen') === '1';
    const forceFresh = searchParams.get('fresh') === '1';

    const snapshot = await getOrcaSnapshot(forceFresh);

    if (wantScreen && getOrcaBin()) {
      const targetHandle =
        terminalParam ||
        (slug ? snapshot.bySlug[slug]?.primaryTerminalHandle : null);

      if (targetHandle) {
        const screen = await readLocalTerminalScreen(targetHandle);
        if (screen && slug && snapshot.bySlug[slug]) {
          const proj = snapshot.bySlug[slug];
          for (const ag of proj.agents) {
            if (ag.terminalHandle === targetHandle || !ag.terminalHandle) {
              ag.screenTail = screen.tail;
              ag.draft = screen.draft;
            }
          }
        }
        return NextResponse.json({
          snapshot,
          screen: screen
            ? {
                terminalHandle: targetHandle,
                tail: screen.tail,
                draft: screen.draft,
                status: screen.status,
              }
            : null,
        });
      }
    }

    return NextResponse.json({ snapshot });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || 'Erro ao consultar Orca Bridge' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      acao?: string;
      slug?: string;
      terminalHandle?: string;
      worktreePath?: string;
      text?: string;
      agentType?: string;
      data?: string;
      snapshot?: OrcaSnapshot;
      commandResults?: OrcaCommandResult[];
    };

    // Endpoint de sincronização chamado pelo relay rodando no Mac do operador
    if (body.acao === 'sync_push') {
      if (body.snapshot && typeof body.snapshot === 'object') {
        await saveSyncedOrcaSnapshot(body.snapshot);
      }
      const pendingCommands = await consumePendingAndSaveResults(body.commandResults);
      return NextResponse.json({
        ok: true,
        pendingCommands,
        watch: await lerWatchAtivo(),
      });
    }

    const validActions = new Set([
      'enviar_prompt',
      'iniciar_agente',
      'interromper',
      'focar_orca',
      'enviar_teclas',
    ]);
    if (!body.acao || !validActions.has(body.acao)) {
      return NextResponse.json(
        { error: 'Ação inválida para Orca Bridge' },
        { status: 400 },
      );
    }

    const cmd: OrcaPendingCommand = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      acao: body.acao as OrcaPendingCommand['acao'],
      slug: body.slug,
      terminalHandle: body.terminalHandle,
      worktreePath: body.worktreePath,
      text: body.text,
      agentType: body.agentType,
      data: typeof body.data === 'string' ? body.data : undefined,
    };

    // 1. Se o Orca CLI está disponível localmente nesta máquina, executa imediatamente!
    if (getOrcaBin()) {
      const result = await executeLocalOrcaCommand(cmd);
      // Teclas são frequentes e a tela chega pelo stream: sem snapshot para não atrasar o lote seguinte.
      if (cmd.acao === 'enviar_teclas') {
        return NextResponse.json({ ok: result.ok, mode: 'local', result });
      }
      const snapshot = await getOrcaSnapshot(true);
      return NextResponse.json({
        ok: result.ok,
        mode: 'local',
        result,
        snapshot,
      });
    }

    // 2. Caso contrário (estamos rodando na nuvem Railway), enfileira para o relay do Mac executar!
    await enqueueRemoteOrcaCommand(cmd);

    // Teclas não esperam resultado: o relay executa na ordem da fila e a tela volta pelo stream.
    if (cmd.acao === 'enviar_teclas') {
      return NextResponse.json({ ok: true, queued: true, mode: 'remote-queued', commandId: cmd.id });
    }

    // Aguarda até 4.5s caso o relay do Mac processe quase em tempo real
    const deadline = Date.now() + 4500;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 450));
      const queue = await readRemoteQueue();
      const completed = queue.results[cmd.id];
      if (completed) {
        const snapshot = await getOrcaSnapshot(false);
        return NextResponse.json({
          ok: completed.ok,
          mode: 'remote-synced',
          result: completed,
          snapshot,
        });
      }
    }

    const snapshot = await getOrcaSnapshot(false);
    return NextResponse.json({
      ok: true,
      queued: true,
      mode: 'remote-queued',
      commandId: cmd.id,
      message: 'Comando enviado para a fila do Orca Remote (será executado em instantes no seu Mac).',
      snapshot,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || 'Falha ao processar comando no Orca Bridge' },
      { status: 500 },
    );
  }
}
