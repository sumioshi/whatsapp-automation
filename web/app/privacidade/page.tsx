import type { Metadata } from "next";

export const metadata: Metadata = { title: "Política de privacidade" };

/**
 * Política pública da integração com o Google Agenda. Fica fora do login porque
 * a tela de consentimento do Google exige um link aberto para ela.
 */
export default function PrivacidadePage() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-6 py-12 text-sm leading-relaxed text-fg-dim">
      <h1 className="text-xl font-medium text-fg">Política de privacidade</h1>
      <p>
        Este painel é uma ferramenta de uso interno. A integração com o Google Agenda existe para
        que o próprio dono da conta veja e organize os seus compromissos dentro do painel.
      </p>
      <h2 className="pt-2 font-medium text-fg">O que acessamos</h2>
      <p>
        A lista das suas agendas e os eventos delas, incluindo título, horário, local, descrição,
        convidados e link de videochamada. Também o e-mail da conta, para mostrar qual conta está
        conectada.
      </p>
      <h2 className="pt-2 font-medium text-fg">Como usamos</h2>
      <p>
        Para mostrar a agenda no painel e criar, alterar ou apagar eventos quando o dono da conta
        pede. Nenhum evento é copiado para um banco de dados: cada leitura busca os dados no Google
        na hora. O servidor guarda só a permissão de acesso, num arquivo protegido.
      </p>
      <h2 className="pt-2 font-medium text-fg">Compartilhamento</h2>
      <p>
        Os dados não são vendidos, compartilhados com terceiros nem usados para publicidade. O uso
        de informações recebidas das APIs do Google segue a Política de Dados do Usuário dos
        Serviços de API do Google, incluindo os requisitos de uso limitado.
      </p>
      <h2 className="pt-2 font-medium text-fg">Como revogar</h2>
      <p>
        A qualquer momento pelo botão “Desconectar Google” na tela de agenda, que apaga a permissão
        guardada, ou em myaccount.google.com/permissions.
      </p>
    </main>
  );
}
