import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import "./globals.css";

export const metadata: Metadata = {
  title: "Signal Room — WhatsApp triage",
  description: "Central de triagem dos grupos de WhatsApp: capturar, transcrever, responder.",
  appleWebApp: { capable: true, title: "Signal Room", statusBarStyle: "black-translucent" },
  icons: { apple: "/apple-touch-icon.png" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Aplica o tema salvo ANTES da 1ª pintura — sem flash de tema errado. */}
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: script estático de tema
          dangerouslySetInnerHTML={{
            __html:
              'try{if(localStorage.getItem("wac-tema")==="light")document.documentElement.dataset.theme="light"}catch(e){}',
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
