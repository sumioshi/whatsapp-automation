import { redirect } from "next/navigation";

/** A casa do painel é a visão de clientes — não uma tela de boas-vindas. */
export default function Home() {
  redirect("/clientes");
}
