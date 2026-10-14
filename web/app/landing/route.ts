import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

function resolverCaminhoHtml(): string {
  const direto = path.join(process.cwd(), "public", "landing", "index.html");
  if (existsSync(direto)) return direto;
  return path.join(process.cwd(), "web", "public", "landing", "index.html");
}

export async function GET() {
  const html = await readFile(resolverCaminhoHtml(), "utf-8");
  return new NextResponse(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
