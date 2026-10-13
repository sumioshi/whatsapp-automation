import { describe, expect, it } from "vitest";
import {
  horaBrt,
  instrucaoDeSaudacao,
  saudacaoDoHorario,
  saudacaoDoTexto,
  saudacaoForaDoHorario,
  saudacaoNaEntrega,
  saudacoesAceitas,
} from "./saudacao";

// Brasília é UTC-3 o ano todo: 15h em Brasília = 18h UTC.
const brt = (hhmm: string) => new Date(`2026-10-13T${hhmm}:00-03:00`);

describe("saudação do horário de Brasília", () => {
  it("dia até meio-dia, tarde até as 18h, noite até as 5h", () => {
    expect(saudacaoDoHorario(brt("09:00"))).toBe("bom dia");
    expect(saudacaoDoHorario(brt("14:00"))).toBe("boa tarde");
    expect(saudacaoDoHorario(brt("20:00"))).toBe("boa noite");
    expect(saudacaoDoHorario(brt("02:00"))).toBe("boa noite");
  });

  it("perto da virada aceita as duas", () => {
    expect(saudacoesAceitas(brt("12:10")).sort()).toEqual(["boa tarde", "bom dia"]);
    expect(saudacoesAceitas(brt("18:20")).sort()).toEqual(["boa noite", "boa tarde"]);
    expect(saudacoesAceitas(brt("04:45")).sort()).toEqual(["boa noite", "bom dia"]);
    expect(saudacoesAceitas(brt("15:00"))).toEqual(["boa tarde"]);
  });

  it("formata a hora de Brasília", () => {
    expect(horaBrt(brt("14:32"))).toBe("14:32");
    expect(horaBrt(new Date("2026-10-13T02:05:00Z"))).toBe("23:05");
  });
});

describe("instrucaoDeSaudacao", () => {
  it("diz a saudação do horário e a hora de Brasília", () => {
    expect(instrucaoDeSaudacao(brt("14:32"))).toBe("saudação do horário: 'boa tarde' (são 14:32 em Brasília)");
  });
});

describe("saudacaoDoTexto", () => {
  it("acha a saudação de período em qualquer balão e grafia", () => {
    expect(saudacaoDoTexto("Opa, bom dia!")).toBe("bom dia");
    expect(saudacaoDoTexto("Boa tardee")).toBe("boa tarde");
    expect(saudacaoDoTexto("bom diaaa")).toBe("bom dia");
    expect(saudacaoDoTexto("subiu\n\nboa noitinha pra vc")).toBe("boa noite");
  });

  it("ignora texto sem saudação de período", () => {
    for (const t of ["Opa, subiu", "o bom é que deu certo", "noite boa de deploy", "fala, tudo certo?", "fiz um bom diagnóstico"]) {
      expect(saudacaoDoTexto(t), t).toBeNull();
    }
  });
});

describe("saudacaoForaDoHorario", () => {
  it("diz qual foi usada e qual cabe agora", () => {
    expect(saudacaoForaDoHorario("Bom dia! subiu", brt("15:00"))).toEqual({ usada: "bom dia", cabe: "boa tarde" });
    expect(saudacaoForaDoHorario("boa noite, tudo certo?", brt("16:00"))).toEqual({ usada: "boa noite", cabe: "boa tarde" });
    expect(saudacaoForaDoHorario("bom dia", brt("03:00"))).toEqual({ usada: "bom dia", cabe: "boa noite" });
  });

  it("passa a saudação certa, a da virada e o texto sem saudação", () => {
    expect(saudacaoForaDoHorario("Bom dia! subiu", brt("09:00"))).toBeNull();
    expect(saudacaoForaDoHorario("Bom dia! subiu", brt("12:10"))).toBeNull();
    expect(saudacaoForaDoHorario("boa tarde", brt("18:20"))).toBeNull();
    expect(saudacaoForaDoHorario("Opa, subiu", brt("15:00"))).toBeNull();
  });
});

describe("saudacaoNaEntrega", () => {
  it("avisa quando a entrega cai em outro período, com a hora em que sairia", () => {
    const aviso = saudacaoNaEntrega("Bom dia! subiu", brt("12:40").toISOString());
    expect(aviso).toMatch(/12:40/);
    expect(aviso).toMatch(/bom dia/);
    expect(aviso).toMatch(/boa tarde/);
  });

  it("não avisa quando a entrega fica no mesmo período ou não há saudação", () => {
    expect(saudacaoNaEntrega("Bom dia! subiu", brt("11:10").toISOString())).toBeNull();
    expect(saudacaoNaEntrega("Opa, subiu", brt("20:00").toISOString())).toBeNull();
    expect(saudacaoNaEntrega("Bom dia! subiu", undefined)).toBeNull();
  });
});
