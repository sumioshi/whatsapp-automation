import { CenaLoaderEscritorio } from './components/CenaLoaderEscritorio';

export default function LoadingEscritorio() {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#11131d]">
      <CenaLoaderEscritorio
        progress={35}
        step="Abrindo Tech Studio 36×26 e sincronizando baias…"
      />
    </div>
  );
}
