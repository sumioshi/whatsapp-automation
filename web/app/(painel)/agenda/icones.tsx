import type { ReactNode } from "react";

/** Traço de 1,75 como o resto do WACrew; o tamanho vem da classe (padrão 16 px). */
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

export const IcAnterior = (p: P) => (
  <Ic {...p}>
    <path d="m15 18-6-6 6-6" />
  </Ic>
);
export const IcProximo = (p: P) => (
  <Ic {...p}>
    <path d="m9 18 6-6-6-6" />
  </Ic>
);
export const IcMais = (p: P) => (
  <Ic {...p}>
    <path d="M12 5v14M5 12h14" />
  </Ic>
);
export const IcVideo = (p: P) => (
  <Ic {...p}>
    <path d="m22 8-6 4 6 4z" />
    <rect x="2" y="6" width="14" height="12" rx="2" />
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
export const IcFechar = (p: P) => (
  <Ic {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Ic>
);
export const IcPainel = (p: P) => (
  <Ic {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M15 3v18" />
  </Ic>
);
export const IcExterno = (p: P) => (
  <Ic {...p}>
    <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </Ic>
);
