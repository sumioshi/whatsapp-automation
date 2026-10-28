import { carregarEstadoEscritorio } from '@/lib/escritorio-estado';
import { EscritorioView } from './EscritorioView';

export const dynamic = 'force-dynamic';

export default async function EscritorioPage() {
  const estado = await carregarEstadoEscritorio();

  return (
    <EscritorioView
      clientesIniciais={estado.clientes}
      presencasIniciais={estado.presencas}
      autonomoInicial={estado.autonomo}
      notasIniciais={estado.notas}
    />
  );
}
