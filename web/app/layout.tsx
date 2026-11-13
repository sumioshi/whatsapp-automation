import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Onest, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const onest = Onest({ subsets: ["latin"], variable: "--font-onest", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });
const serif = Source_Serif_4({
  subsets: ["latin"],
  axes: ["opsz"],
  variable: "--font-source-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "WACrew",
  description: "Atendimento dos clientes no WhatsApp: quem espera, quem respondeu, contratos e agenda.",
  appleWebApp: { capable: true, title: "WACrew", statusBarStyle: "default" },
  icons: { apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef0f3" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0b0d" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${onest.variable} ${jetbrains.variable} ${serif.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Aplica a escolha de tema salva ANTES da 1ª pintura; sem escolha, segue o sistema. */}
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: script estático de tema
          dangerouslySetInnerHTML={{
            __html:
              'try{var t=localStorage.getItem("wac-tema");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t;document.querySelectorAll("meta[name=theme-color]").forEach(function(m){m.content=t==="dark"?"#0a0b0d":"#eef0f3"})}}catch(e){}',
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
