import { listGroups } from "@/lib/data";
import { CommandPalette } from "../components/CommandPalette";
import { Sidebar } from "../components/Sidebar";

export const dynamic = "force-dynamic";

export default async function PainelLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const groups = await listGroups();
  return (
    <>
      <div className="flex h-screen overflow-hidden">
        <Sidebar groups={groups} />
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>
      <CommandPalette groups={groups} />
    </>
  );
}
