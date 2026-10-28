import { obterEstadoEscritorioImediato } from '@/lib/escritorio-estado';
import { EscritorioView } from './EscritorioView';

export const dynamic = 'force-dynamic';

export default function EscritorioPage() {
  const estado = obterEstadoEscritorioImediato();

  return (
    <EscritorioView
      clientesIniciais={estado.clientes}
      presencasIniciais={estado.presencas}
      autonomoInicial={estado.autonomo}
      notasIniciais={estado.notas}
    />
  );
}
