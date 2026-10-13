import { describe, expect, it } from "vitest";
import type { Contacts } from "../contacts";
import type { MessageView } from "../data";
import { INSTRUCAO_PRIMEIRA_PESSOA, nomeDoOperador, pedeAval, perguntaSeEhIa, revelaAutomacao, travaAutonoma } from "./identidade";

const contatos: Contacts = {
  names: new Map([["5511000000001", "Fulano Silva"]]),
  ownIds: new Set(["5511000000001"]),
  teamIds: new Set(),
  phones: new Map(),
  lids: new Set(),
  hasSidecar: false,
} as unknown as Contacts;

let seq = 0;
function msg(p: Partial<MessageView> & { ts: string; de: "eu" | "cliente" }): MessageView {
  const sender = p.de === "eu" ? "5511000000001@s.whatsapp.net" : "5511000000009@s.whatsapp.net";
  return {
    id: `m${++seq}`, timestamp: p.ts, group: "g", groupJid: "g@g.us", sender, senderName: p.de,
    fromMe: p.de === "eu", type: p.type ?? "text", text: p.text ?? "", quotedText: null, quotedSender: null, mediaPath: null,
    transcript: null, reactions: [], receipt: null, poll: null,
    ...(p.origem ? { origem: p.origem } : {}), ...(p.ator ? { ator: p.ator } : {}),
  } as MessageView;
}

const T = (min: number) => new Date(Date.UTC(2026, 9, 8, 21, min)).toISOString();
const agora = new Date(Date.UTC(2026, 9, 8, 21, 40));

describe("revelaAutomacao", () => {
  it("pega o agente se apresentando como IA", () => {
    for (const t of [
      "kkkkk é sim, deixei a IA respondendo aqui",
      "sou uma IA, mas posso ajudar",
      "aqui é o assistente virtual",
      "a IA tá respondendo enquanto ele tá em reunião",
      "coloquei um bot pra responder",
      "essa é uma resposta automática",
      "quem tá respondendo aqui é o robô",
    ]) {
      expect(revelaAutomacao(t), t).not.toEqual([]);
    }
  });

  it("pega o operador na terceira pessoa", () => {
    expect(revelaAutomacao("o clube o Fulano já liberou pra abrir", "Fulano")).toEqual(["o Fulano"]);
    expect(revelaAutomacao("falei com o fulano agora", "Fulano")).not.toEqual([]);
    expect(revelaAutomacao("ligo na hora, vou confirmar com o Fulano se já abrimos", "Fulano")).toEqual(["com o Fulano"]);
  });

  it("deixa passar assunto de trabalho sobre IA", () => {
    for (const t of [
      "a integração com a IA do Gemini já tá no ar",
      "o bot do Telegram voltou",
      "vou subir o assistente de vendas amanhã",
      "a automação de cobrança roda às 8h",
      "Fulano, tudo certo?",
      "Boa tarde, tudo bem? É o Fulano do projeto",
      "Oláa, sou o Fulano, foi enviado aqui?",
    ]) {
      expect(revelaAutomacao(t, "Fulano"), t).toEqual([]);
    }
  });
});

describe("revelaAutomacao: o nome do operador sem artigo", () => {
  it("pega o nome dele como sujeito ou depois de preposição", () => {
    for (const t of [
      "Fulano vai ver isso amanhã",
      "falo com Fulano e te retorno",
      "Fulano pediu pra avisar que sai amanhã",
      "amanhã fulano te responde",
      "vou ver isso aqui\nFulano te chama depois",
    ]) {
      expect(revelaAutomacao(t, "Fulano"), t).not.toEqual([]);
    }
  });

  it("deixa passar chamamento e apresentação", () => {
    for (const t of [
      "Fala Fulano, tudo certo?",
      "valeu Fulano!",
      "bom dia Fulano",
      "Fulano aqui, tudo certo?",
      "beleza, Fulano",
      "pode testar, Fulano?",
      "Fulano!",
      "sou Fulano, do projeto",
    ]) {
      expect(revelaAutomacao(t, "Fulano"), t).toEqual([]);
    }
  });
});

describe("revelaAutomacao: sobrenome do operador", () => {
  it("pega o sobrenome dele na terceira pessoa", () => {
    expect(revelaAutomacao("o Souza vai ver isso", "Fulano Souza")).not.toEqual([]);
    expect(revelaAutomacao("Souza já liberou", "Fulano Souza")).not.toEqual([]);
  });

  it("deixa passar o nome completo na apresentação e o sobrenome de outra pessoa", () => {
    for (const t of ["aqui é o Fulano Souza", "sou o Fulano Souza, do projeto", "falei com a Maria Souza do financeiro"]) {
      expect(revelaAutomacao(t, "Fulano Souza"), t).toEqual([]);
    }
  });

  it("continua pegando o primeiro nome quando vem o nome completo", () => {
    expect(revelaAutomacao("vou ver com o Fulano e te aviso", "Fulano Souza")).not.toEqual([]);
    expect(revelaAutomacao("Fulano Souza vai te chamar", "Fulano Souza")).not.toEqual([]);
  });
});

describe("revelaAutomacao: chefe e dono", () => {
  it("pega quem fala como se tivesse chefe ou dono acima", () => {
    for (const t of ["o dono vai te responder", "meu chefe pediu pra avisar", "a dona tá vendo isso", "minha gestora já aprovou", "o responsável vai te chamar"]) {
      expect(revelaAutomacao(t), t).not.toEqual([]);
    }
  });

  it("deixa passar o dono ou o responsável do lado do cliente", () => {
    for (const t of ["o dono da loja pediu o relatório", "o responsável pelo servidor de vocês", "quem é o responsável aí?"]) {
      expect(revelaAutomacao(t), t).toEqual([]);
    }
  });
});

describe("INSTRUCAO_PRIMEIRA_PESSOA", () => {
  it("lembra a primeira pessoa e sugere uma saída que a revisão deixa passar", () => {
    expect(INSTRUCAO_PRIMEIRA_PESSOA).toMatch(/primeira pessoa/);
    expect(INSTRUCAO_PRIMEIRA_PESSOA).toMatch(/vou ver aqui/);
    expect(revelaAutomacao("vou ver aqui", "Fulano Souza")).toEqual([]);
    expect(pedeAval("vou ver aqui")).toEqual([]);
  });
});

describe("perguntaSeEhIa", () => {
  it("reconhece o contato desconfiando da conversa", () => {
    for (const t of ["tá falando comigo por ia né", "isso é bot?", "vc é robô kkk", "é você mesmo ou é o chatgpt?", "tá respondendo automático?"]) {
      expect(perguntaSeEhIa(t), t).toBe(true);
    }
  });
  it("não confunde pedido de trabalho sobre IA", () => {
    for (const t of ["a IA do sistema errou o cálculo", "dá pra colocar um bot no site?", "manda o prompt do gpt"]) {
      expect(perguntaSeEhIa(t), t).toBe(false);
    }
  });
});

describe("travaAutonoma", () => {
  it("trava quando o operador respondeu na mão há pouco (áudio conta)", () => {
    const msgs = [msg({ de: "cliente", text: "tudo certo?", ts: T(20) }), msg({ de: "eu", type: "audio", origem: "celular", ts: T(35) })];
    expect(travaAutonoma(msgs, contatos, agora)?.regra).toBe("operador_assumiu");
  });

  it("envio de alguém da equipe pelo painel também conta como na mão", () => {
    const msgs = [msg({ de: "eu", text: "já vejo", origem: "coletor", ator: "painel", ts: T(38) })];
    expect(travaAutonoma(msgs, contatos, agora)?.regra).toBe("operador_assumiu");
  });

  it("não trava pelo que o próprio agente mandou", () => {
    const msgs = [msg({ de: "cliente", text: "oi", ts: T(30) }), msg({ de: "eu", text: "opa", origem: "coletor", ts: T(35) })];
    expect(travaAutonoma(msgs, contatos, agora)).toBeNull();
  });

  it("trava quando o contato perguntou se é IA e o operador não respondeu depois", () => {
    const msgs = [msg({ de: "eu", text: "pronto", origem: "coletor", ts: T(5) }), msg({ de: "cliente", text: "tá falando comigo por ia né", ts: T(10) })];
    const t = travaAutonoma(msgs, contatos, agora);
    expect(t?.regra).toBe("perguntou_ia");
    // o aviso do alertar_chat depende do notificador local; o motivo não amarra o canal
    expect(t?.motivo).toMatch(/chame o operador/);
    expect(t?.motivo).not.toMatch(/alertar_chat/);
  });

  it("libera depois que o operador respondeu na mão e a janela passou", () => {
    const msgs = [
      msg({ de: "cliente", text: "tá falando comigo por ia né", ts: T(0) }),
      msg({ de: "eu", type: "audio", origem: "celular", ts: T(2) }),
      msg({ de: "cliente", text: "blz", ts: T(20) }),
    ];
    expect(travaAutonoma(msgs, contatos, agora)).toBeNull();
  });
});

describe("nomeDoOperador", () => {
  it("usa a variável de ambiente inteira (nome e sobrenome) ou o primeiro nome do próprio contato", () => {
    expect(nomeDoOperador(contatos, { WAC_NOME_OPERADOR: "Beltrano Souza" })).toBe("Beltrano Souza");
    expect(nomeDoOperador(contatos, {})).toBe("Fulano");
    expect(nomeDoOperador(undefined, {})).toBeUndefined();
  });
});

describe("pedeAval", () => {
  it("pega o agente adiando a decisão para alguém", () => {
    for (const t of [
      "ligo na hora, vou confirmar com o Beltrano se já abrimos",
      "vou ver com o responsável e te falo",
      "deixa eu checar com a equipe",
      "preciso alinhar com meu sócio",
      "vou perguntar pro Ciclano",
    ]) {
      expect(pedeAval(t), t).not.toEqual([]);
    }
  });
  it("deixa passar o próximo passo em primeira pessoa", () => {
    for (const t of ["vou ver aqui e te falo", "vou confirmar e já te mando", "deixa eu conferir o log", "vou ver com calma amanhã", "confirma pra mim o horário?"]) {
      expect(pedeAval(t), t).toEqual([]);
    }
  });
});
