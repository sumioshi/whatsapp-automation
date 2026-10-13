import type { ReactNode } from "react";

/** Traço de 1,75 como o resto do Balcão; o tamanho vem da classe (padrão 16 px). */
function Ic({ children, className = "h-4 w-4" }: { children: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`shrink-0 ${className}`}
    >
      {children}
    </svg>
  );
}

type P = { className?: string };

export const IcPessoas = (p: P) => (
  <Ic {...p}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </Ic>
);
export const IcHash = (p: P) => (
  <Ic {...p}>
    <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />
  </Ic>
);
export const IcEtiqueta = (p: P) => (
  <Ic {...p}>
    <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" />
    <circle cx="7.5" cy="7.5" r="1" />
  </Ic>
);
export const IcDoc = (p: P) => (
  <Ic {...p}>
    <path d="M9 12h6M9 16h6M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" />
  </Ic>
);
export const IcGrafico = (p: P) => (
  <Ic {...p}>
    <path d="M3 3v18h18" />
    <path d="m7 15 4-4 3 3 5-6" />
  </Ic>
);
export const IcCheck = (p: P) => (
  <Ic {...p}>
    <path d="M20 6 9 17l-5-5" />
  </Ic>
);
export const IcRelogio = (p: P) => (
  <Ic {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Ic>
);
export const IcConversa = (p: P) => (
  <Ic {...p}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </Ic>
);
export const IcCalendario = (p: P) => (
  <Ic {...p}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </Ic>
);
export const IcOrdem = (p: P) => (
  <Ic {...p}>
    <path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4" />
  </Ic>
);
export const IcColunas = (p: P) => (
  <Ic {...p}>
    <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
  </Ic>
);
export const IcMais = (p: P) => (
  <Ic {...p}>
    <path d="M12 5v14M5 12h14" />
  </Ic>
);
export const IcSetaBaixo = (p: P) => (
  <Ic {...p}>
    <path d="m6 9 6 6 6-6" />
  </Ic>
);
export const IcBusca = (p: P) => (
  <Ic {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </Ic>
);
export const IcFechar = (p: P) => (
  <Ic {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Ic>
);
export const IcSilencio = (p: P) => (
  <Ic {...p}>
    <path d="M13.7 21a2 2 0 0 1-3.4 0M18.6 13A17.9 17.9 0 0 1 18 8M6.3 6.3A5.9 5.9 0 0 0 6 8c0 7-3 9-3 9h14M18 8a6 6 0 0 0-9.3-5M2 2l20 20" />
  </Ic>
);
export const IcNota = (p: P) => (
  <Ic {...p}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
  </Ic>
);
export const IcSincronizar = (p: P) => (
  <Ic {...p}>
    <path d="M21 12a9 9 0 0 1-15.4 6.4L3 16" />
    <path d="M3 12a9 9 0 0 1 15.4-6.4L21 8" />
    <path d="M3 21v-5h5M21 3v5h-5" />
  </Ic>
);
export const IcAtividade = (p: P) => (
  <Ic {...p}>
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </Ic>
);
export const IcPacote = (p: P) => (
  <Ic {...p}>
    <path d="M21 8 12 3 3 8v8l9 5 9-5z" />
    <path d="m3 8 9 5 9-5M12 13v8" />
  </Ic>
);
