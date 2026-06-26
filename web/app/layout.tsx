import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { listGroups } from "@/lib/data";
import { CommandPalette } from "./components/CommandPalette";
import { Sidebar } from "./components/Sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Signal Room — WhatsApp triage",
  description: "Central de triagem dos grupos de WhatsApp: capturar, transcrever, responder.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const groups = await listGroups();
  return (
    <html lang="pt-BR" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <div className="flex h-screen overflow-hidden">
          <Sidebar groups={groups} />
          <main className="flex min-w-0 flex-1 flex-col">{children}</main>
        </div>
        <CommandPalette groups={groups} />
      </body>
    </html>
  );
}
