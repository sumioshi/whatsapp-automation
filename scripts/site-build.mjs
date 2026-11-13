#!/usr/bin/env node
// Build estático do site wacrew.com.br (GitHub Pages).
//
// Lê `site/` e gera `_site/`:
//   - copia `site/` inteiro (menos as fontes Markdown dos posts);
//   - converte `site/blog/posts/*.md` (front matter + Markdown) em `_site/blog/<slug>/index.html`
//     e publica o Markdown limpo em `_site/blog/<slug>/index.md` (leitura por agentes de IA);
//   - gera `_site/blog/index.html`, `sitemap.xml`, `robots.txt`, `feed.xml` e `llms.txt`.
//
// Dependência única: `marked`, versão fixa, instalada só para o build, fora do package.json:
//   npm i --no-save --no-package-lock --prefix .site-deps marked@18.1.3
//   node scripts/site-build.mjs
// O workflow `.github/workflows/pages.yml` faz exatamente isso.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const MARKED_VERSION = "18.1.3";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "site");
const OUT = join(ROOT, "_site");
const POSTS_DIR = join(SRC, "blog", "posts");

const SITE = {
  url: "https://wacrew.com.br",
  name: "WACrew",
  repo: "https://github.com/sumioshi/wacrew",
  ogImage: "https://wacrew.com.br/assets/art/og-card.png",
  ogImageAlt: "WACrew, automação de WhatsApp com IA de código aberto",
  logo: "https://wacrew.com.br/icon-512.png",
  author: { name: "Rodrigo Sumioshi", url: "https://rodrigosumioshi.com", sameAs: ["https://github.com/sumioshi"] },
  blogTitle: "Blog do WACrew",
  blogDescription:
    "Guias práticos sobre atendimento de clientes no WhatsApp, automação com IA que não parece robô e agentes de código conectados por MCP.",
};

// ---------------------------------------------------------------- marked

async function loadMarked() {
  const local = join(ROOT, ".site-deps", "node_modules", "marked");
  let mod;
  let pkgPath;
  if (existsSync(join(local, "package.json"))) {
    pkgPath = join(local, "package.json");
    const entry = JSON.parse(readFileSync(pkgPath, "utf8")).exports["."].default;
    mod = await import(pathToFileURL(join(local, entry)).href);
  } else {
    try {
      mod = await import("marked");
    } catch {
      console.error(
        `marked não encontrado. Rode:\n  npm i --no-save --no-package-lock --prefix .site-deps marked@${MARKED_VERSION}`,
      );
      process.exit(1);
    }
  }
  if (pkgPath) {
    const v = JSON.parse(readFileSync(pkgPath, "utf8")).version;
    if (v !== MARKED_VERSION) console.warn(`aviso: marked ${v} instalado, o build fixa ${MARKED_VERSION}`);
  }
  return mod.Marked;
}

// ---------------------------------------------------------------- utilidades

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const xml = esc;

function slugify(s) {
  return String(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function stripTags(html) {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

// JSON dentro de <script>: impede que "</script>" feche o bloco.
const jsonLd = (obj) => JSON.stringify(obj, null, 2).replace(/</g, "\\u003c");

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
function dataExtenso(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} de ${MESES[m - 1]} de ${y}`;
}
// Datas do front matter são do horário de Brasília.
const isoComFuso = (d) => `${d}T09:00:00-03:00`;
const rfc822 = (d) => new Date(isoComFuso(d)).toUTCString();

// Front matter simples: `chave: valor` por linha, aspas opcionais.
function parseFrontMatter(raw, file) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new Error(`${file}: sem front matter`);
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const i = line.indexOf(":");
    if (i < 0) throw new Error(`${file}: linha inválida no front matter: ${line}`);
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    data[line.slice(0, i).trim()] = v;
  }
  for (const k of ["title", "description", "slug", "date"]) {
    if (!data[k]) throw new Error(`${file}: front matter sem "${k}"`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) throw new Error(`${file}: date precisa ser AAAA-MM-DD`);
  data.updated ||= data.date;
  return { data, body: m[2] };
}

// Dimensões de WebP/PNG para width/height nas imagens (evita salto de layout).
const dimCache = new Map();
function imageSize(urlPath) {
  if (!urlPath.startsWith("/")) return null;
  if (dimCache.has(urlPath)) return dimCache.get(urlPath);
  const file = join(SRC, urlPath);
  let dim = null;
  if (existsSync(file)) {
    const b = readFileSync(file);
    if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
      const chunk = b.toString("ascii", 12, 16);
      if (chunk === "VP8X") dim = { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
      else if (chunk === "VP8 ") dim = { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
      else if (chunk === "VP8L") {
        const bits = b.readUInt32LE(21);
        dim = { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
      }
    } else if (b.readUInt32BE(0) === 0x89504e47) {
      dim = { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    }
  }
  dimCache.set(urlPath, dim);
  return dim;
}

function lastmodOf(file) {
  try {
    const out = execFileSync("git", ["log", "-1", "--format=%cs", "--", file], { cwd: ROOT, encoding: "utf8" }).trim();
    if (out) return out;
  } catch {}
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- Markdown

function makeRenderer(Marked) {
  const md = new Marked({ gfm: true });
  let headings = [];
  const figure = ({ href, title, text }) => {
    const dim = imageSize(href);
    const size = dim ? ` width="${dim.w}" height="${dim.h}"` : "";
    const img = `<img src="${esc(href)}" alt="${esc(text)}"${size} loading="lazy" decoding="async">`;
    return `<figure>${img}${title ? `<figcaption>${esc(title)}</figcaption>` : ""}</figure>\n`;
  };
  md.use({
    renderer: {
      heading({ tokens, depth }) {
        const inner = this.parser.parseInline(tokens);
        const id = slugify(stripTags(inner));
        if (depth === 2) headings.push({ id, text: stripTags(inner) });
        return `<h${depth} id="${id}">${inner}</h${depth}>\n`;
      },
      paragraph({ tokens }) {
        const only = tokens.filter((t) => !(t.type === "text" && !t.text.trim()));
        if (only.length === 1 && only[0].type === "image") return figure(only[0]);
        return `<p>${this.parser.parseInline(tokens)}</p>\n`;
      },
      image(token) {
        const dim = imageSize(token.href);
        const size = dim ? ` width="${dim.w}" height="${dim.h}"` : "";
        return `<img src="${esc(token.href)}" alt="${esc(token.text)}"${size} loading="lazy" decoding="async">`;
      },
      link({ href, title, tokens }) {
        const inner = this.parser.parseInline(tokens);
        const ext = /^https?:\/\//.test(href) && !href.startsWith(SITE.url);
        const t = title ? ` title="${esc(title)}"` : "";
        return `<a href="${esc(href)}"${t}${ext ? ' rel="noopener"' : ""}>${inner}</a>`;
      },
      table(token) {
        // Tabela larga rola dentro da própria caixa no celular, sem rolar a página.
        const head = token.header.map((c) => `<th>${this.parser.parseInline(c.tokens)}</th>`).join("");
        const rows = token.rows
          .map((r) => `<tr>${r.map((c) => `<td>${this.parser.parseInline(c.tokens)}</td>`).join("")}</tr>`)
          .join("\n");
        return `<div class="table"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>\n`;
      },
    },
  });
  return (src) => {
    headings = [];
    const html = md.parse(src);
    return { html, headings: [...headings] };
  };
}

// ---------------------------------------------------------------- template

const FONTS =
  "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&display=swap";

const CSS = `
:root{--bg:#fafaf9;--surface:#fff;--ink:#1c1917;--ink-2:#44403c;--muted:#78716c;--line:#e7e5e4;--accent:#4f46e5;--accent-ink:#4338ca;
--serif:"Newsreader","Iowan Old Style",Georgia,serif;--sans:"Geist",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;--mono:"Geist Mono",ui-monospace,"SF Mono",Menlo,monospace;--read:680px;--g:16px}
@media (min-width:768px){:root{--g:32px}}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.7 var(--sans);-webkit-font-smoothing:antialiased}
img{display:block;max-width:100%;height:auto}
a{color:var(--accent)}a:hover{color:var(--accent-ink)}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:4px}
.skip{position:absolute;left:12px;top:-60px;background:var(--ink);color:#fff;padding:10px 14px;border-radius:10px;text-decoration:none;z-index:10}.skip:focus{top:12px}
.wrap{max-width:calc(1120px + var(--g)*2);margin:0 auto;padding:0 var(--g)}
.read{max-width:calc(var(--read) + var(--g)*2);margin:0 auto;padding:0 var(--g)}
header.top{border-bottom:1px solid var(--line);background:var(--bg)}
header.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:16px;height:64px}
.brand{font:500 20px/1 var(--serif);color:var(--ink);text-decoration:none;letter-spacing:-.01em}
nav.links{display:flex;align-items:center;gap:20px;font-size:15px}
nav.links a{color:var(--ink-2);text-decoration:none}nav.links a:hover{color:var(--ink)}
nav.links a[aria-current]{color:var(--ink);font-weight:500}
.btn{display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 16px;border-radius:10px;background:var(--accent);color:#fff!important;font:500 15px/1 var(--sans);text-decoration:none;white-space:nowrap}
.btn:hover{background:var(--accent-ink)}
.btn-sm{height:36px;padding:0 14px;font-size:14px}
.label{font:500 12px/1.4 var(--mono);letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}
.crumbs{margin:40px 0 0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:6px;font:400 13px/1.5 var(--mono);color:var(--muted)}
.crumbs li+li::before{content:"/";margin-right:6px;color:var(--line)}
.crumbs a{color:var(--muted);text-decoration:none}.crumbs a:hover{color:var(--ink)}
h1,h2,h3{font-family:var(--serif);font-weight:400;letter-spacing:-.015em;color:var(--ink);text-wrap:balance}
article h1{font-size:clamp(34px,6vw,48px);line-height:1.1;margin:20px 0 16px}
.lead{font-size:19px;line-height:1.6;color:var(--ink-2);margin:0 0 20px}
.meta{display:flex;flex-wrap:wrap;gap:6px 10px;margin:0 0 32px}
.meta .label+.label::before{content:"·";margin-right:10px}
.hero{margin:0 0 40px;border:1px solid var(--line);border-radius:16px;overflow:hidden;background:var(--surface)}
.toc{border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:16px 0;margin:0 0 40px}
.toc ol{margin:8px 0 0;padding-left:20px;font-size:15px;line-height:1.8}
.toc a{color:var(--ink-2);text-decoration:none}.toc a:hover{color:var(--accent)}
.prose{overflow-wrap:break-word}
.prose h2{font-size:30px;line-height:1.2;margin:56px 0 12px;scroll-margin-top:24px}
.prose h3{font-size:22px;line-height:1.3;margin:36px 0 8px;scroll-margin-top:24px}
.prose p,.prose ul,.prose ol{margin:0 0 20px}
.prose li{margin:0 0 8px}.prose li::marker{color:var(--muted)}
.prose strong{font-weight:600}
.prose code{font:400 .86em/1.5 var(--mono);background:#f5f5f4;border:1px solid var(--line);border-radius:6px;padding:1px 5px}
.prose pre{background:#1c1917;color:#f5f5f4;border-radius:12px;padding:16px 18px;overflow-x:auto;margin:0 0 24px;font:400 14px/1.6 var(--mono)}
.prose pre code{background:none;border:0;padding:0;color:inherit;font-size:inherit}
.prose blockquote{margin:0 0 24px;padding:4px 0 4px 18px;border-left:2px solid var(--line);color:var(--ink-2)}
.prose figure{margin:32px 0}
.prose figure img{border:1px solid var(--line);border-radius:12px;background:var(--surface)}
.prose figcaption{margin-top:10px;font-size:14px;line-height:1.5;color:var(--muted)}
.prose hr{border:0;border-top:1px solid var(--line);margin:40px 0}
.table{overflow-x:auto;margin:0 0 24px;border:1px solid var(--line);border-radius:12px;background:var(--surface)}
.table table{border-collapse:collapse;width:100%;font-size:15px;line-height:1.5}
.table th,.table td{text-align:left;vertical-align:top;padding:10px 14px;border-bottom:1px solid var(--line)}
.table th{font:500 12px/1.4 var(--mono);text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
.table tr:last-child td{border-bottom:0}
.cta{margin:56px 0 0;padding:28px;border:1px solid var(--line);border-radius:16px;background:var(--surface)}
.cta h2{font-size:26px;line-height:1.25;margin:8px 0 8px}
.cta p{margin:0 0 20px;color:var(--ink-2)}
.cta .row{display:flex;flex-wrap:wrap;align-items:center;gap:12px 20px;font-size:15px}
.related{margin:56px 0 0}
.related ul{list-style:none;margin:12px 0 0;padding:0;border-top:1px solid var(--line)}
.related li{border-bottom:1px solid var(--line)}
.related a{display:block;padding:14px 0;text-decoration:none;color:var(--ink);font:400 20px/1.35 var(--serif)}
.related a:hover{color:var(--accent)}
.blog-head{padding:0 0 32px;border-bottom:1px solid var(--line)}
.blog-head h1{font-size:clamp(38px,7vw,56px);line-height:1.05;margin:20px 0 12px}
.blog-head p{font-size:19px;color:var(--ink-2);margin:0;max-width:560px}
.posts{list-style:none;margin:0;padding:0}
.posts li{border-bottom:1px solid var(--line);padding:32px 0}
.posts h2{font-size:clamp(24px,4vw,30px);line-height:1.2;margin:10px 0 8px}
.posts h2 a{color:var(--ink);text-decoration:none}.posts h2 a:hover{color:var(--accent)}
.posts p{margin:0 0 10px;color:var(--ink-2)}
.posts .more{font-size:15px}
footer.foot{margin-top:96px;border-top:1px solid var(--line);padding:32px 0 48px;font-size:14px;color:var(--muted)}
footer.foot .wrap{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px 24px}
footer.foot nav{display:flex;flex-wrap:wrap;gap:8px 18px}
footer.foot a{color:var(--ink-2);text-decoration:none}footer.foot a:hover{color:var(--ink)}
footer.foot p{margin:0}
@media (max-width:560px){nav.links .hide-sm{display:none}body{font-size:16.5px}.prose h2{font-size:26px}.cta{padding:22px}}
`;

function head({ title, description, canonical, ogType, extra = "", ld }) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="#fafaf9">
<meta name="color-scheme" content="light">
<meta name="author" content="${esc(SITE.author.name)}">
<link rel="author" href="https://rodrigosumioshi.com">
<meta property="og:type" content="${ogType}">
<meta property="og:locale" content="pt_BR">
<meta property="og:site_name" content="${SITE.name}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${SITE.ogImage}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(SITE.ogImageAlt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${SITE.ogImage}">
<meta name="twitter:image:alt" content="${esc(SITE.ogImageAlt)}">
${extra}<link rel="alternate" type="application/rss+xml" title="${SITE.blogTitle}" href="${SITE.url}/feed.xml">
<link rel="icon" href="/assets/logo/wacrew-app.svg" type="image/svg+xml">
<link rel="icon" href="/icon-192.png" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<style>${CSS.trim()}</style>
<script type="application/ld+json">
${jsonLd(ld)}
</script>
</head>`;
}

function topbar(current) {
  return `<a class="skip" href="#conteudo">Pular para o conteúdo</a>
<header class="top">
  <div class="wrap">
    <a class="brand" href="/" style="display:inline-flex;align-items:center;gap:8px"><img src="/assets/logo/wacrew-mark.svg" alt="" width="26" height="26" style="image-rendering:pixelated;display:block">WACrew</a>
    <nav class="links" aria-label="Principal">
      <a class="hide-sm" href="/#como-funciona">Como funciona</a>
      <a href="/blog/"${current === "blog" ? ' aria-current="page"' : ""}>Blog</a>
      <a class="btn btn-sm" href="${SITE.repo}">Ver no GitHub</a>
    </nav>
  </div>
</header>`;
}

function footer() {
  return `<footer class="foot">
  <div class="wrap">
    <nav aria-label="Rodapé">
      <a href="/">WACrew</a>
      <a href="/blog/">Blog</a>
      <a href="${SITE.repo}">GitHub</a>
      <a href="/feed.xml">RSS</a>
      <span>Apache 2.0</span>
    </nav>
    <p>Feito por <a href="https://rodrigosumioshi.com" rel="author">Rodrigo Sumioshi</a>. Projeto independente, sem vínculo com o WhatsApp ou a Meta.</p>
  </div>
</footer>
</body>
</html>
`;
}

function crumbs(items) {
  const lis = items
    .map((it, i) =>
      i === items.length - 1
        ? `<li><span aria-current="page">${esc(it.name)}</span></li>`
        : `<li><a href="${it.path}">${esc(it.name)}</a></li>`,
    )
    .join("");
  return `<ol class="crumbs">${lis}</ol>`;
}

function breadcrumbLd(items) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: SITE.url + it.path,
    })),
  };
}

const PUBLISHER = {
  "@type": "Organization",
  "@id": `${SITE.url}/#organization`,
  name: SITE.name,
  url: `${SITE.url}/`,
  logo: { "@type": "ImageObject", url: SITE.logo, width: 512, height: 512 },
  sameAs: [SITE.repo],
};
const AUTHOR = { "@type": "Person", name: SITE.author.name, url: SITE.author.url, sameAs: SITE.author.sameAs };

function ctaBlock() {
  return `<aside class="cta" aria-labelledby="cta-titulo">
  <p class="label">Código aberto · Apache 2.0</p>
  <h2 id="cta-titulo">O WACrew é grátis e roda na sua máquina.</h2>
  <p>Fila por tempo de espera, respostas na sua voz entregues no ritmo de gente e um servidor MCP para o seu agente de código. Você aprova cada mensagem ou deixa no automático, conversa por conversa.</p>
  <div class="row">
    <a class="btn" href="${SITE.repo}">Ver no GitHub</a>
    <a href="/">Conhecer o WACrew</a>
  </div>
</aside>`;
}

function renderPost(post, all) {
  const canonical = `${SITE.url}/blog/${post.slug}/`;
  const trail = [
    { name: "Início", path: "/" },
    { name: "Blog", path: "/blog/" },
    { name: post.title, path: `/blog/${post.slug}/` },
  ];
  const image = post.image ? SITE.url + post.image : SITE.ogImage;
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BlogPosting",
        "@id": `${canonical}#post`,
        headline: post.title,
        description: post.description,
        image: [image, SITE.ogImage],
        datePublished: isoComFuso(post.date),
        dateModified: isoComFuso(post.updated),
        inLanguage: "pt-BR",
        keywords: post.keyword || undefined,
        wordCount: post.words,
        author: AUTHOR,
        publisher: PUBLISHER,
        mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
        isPartOf: { "@type": "Blog", "@id": `${SITE.url}/blog/#blog`, name: SITE.blogTitle },
      },
      breadcrumbLd(trail),
    ],
  };
  const toc = post.headings.length >= 3
    ? `<nav class="toc" aria-labelledby="toc-titulo"><p class="label" id="toc-titulo">Neste artigo</p><ol>${post.headings
        .map((h) => `<li><a href="#${h.id}">${esc(h.text)}</a></li>`)
        .join("")}</ol></nav>`
    : "";
  const hero = post.image
    ? (() => {
        const dim = imageSize(post.image);
        const size = dim ? ` width="${dim.w}" height="${dim.h}"` : "";
        return `<figure class="hero"><img src="${esc(post.image)}" alt="${esc(post.imageAlt || "")}"${size} fetchpriority="high"></figure>`;
      })()
    : "";
  const others = all.filter((p) => p.slug !== post.slug);
  const related = others.length
    ? `<section class="related" aria-labelledby="rel-titulo"><p class="label" id="rel-titulo">Leia também</p><ul>${others
        .map((p) => `<li><a href="/blog/${p.slug}/">${esc(p.title)}</a></li>`)
        .join("")}</ul></section>`
    : "";
  const extra = `<meta property="article:published_time" content="${isoComFuso(post.date)}">
<meta property="article:modified_time" content="${isoComFuso(post.updated)}">
<meta property="article:author" content="${esc(SITE.author.name)}">
<link rel="alternate" type="text/markdown" href="/blog/${post.slug}/index.md">
`;
  return `${head({ title: post.seoTitle || `${post.title} · WACrew`, description: post.description, canonical, ogType: "article", extra, ld })}
<body>
${topbar("blog")}
<main id="conteudo">
  <article class="read">
    <nav aria-label="Trilha">${crumbs(trail)}</nav>
    <h1>${esc(post.title)}</h1>
    <p class="lead">${esc(post.description)}</p>
    <div class="meta">
      <span class="label">Por ${esc(SITE.author.name)}</span>
      <span class="label"><time datetime="${post.date}">${dataExtenso(post.date)}</time></span>
      <span class="label">${post.minutes} min de leitura</span>
    </div>
    ${hero}
    ${toc}
    <div class="prose">
${post.html}
    </div>
    ${ctaBlock()}
    ${related}
  </article>
</main>
${footer()}`;
}

function renderBlogIndex(posts) {
  const canonical = `${SITE.url}/blog/`;
  const trail = [
    { name: "Início", path: "/" },
    { name: "Blog", path: "/blog/" },
  ];
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Blog",
        "@id": `${canonical}#blog`,
        name: SITE.blogTitle,
        description: SITE.blogDescription,
        url: canonical,
        inLanguage: "pt-BR",
        publisher: PUBLISHER,
        blogPost: posts.map((p) => ({
          "@type": "BlogPosting",
          headline: p.title,
          url: `${SITE.url}/blog/${p.slug}/`,
          datePublished: isoComFuso(p.date),
          dateModified: isoComFuso(p.updated),
          author: AUTHOR,
        })),
      },
      breadcrumbLd(trail),
    ],
  };
  const items = posts
    .map(
      (p) => `<li>
      <p class="label"><time datetime="${p.date}">${dataExtenso(p.date)}</time> · ${p.minutes} min de leitura</p>
      <h2><a href="/blog/${p.slug}/">${esc(p.title)}</a></h2>
      <p>${esc(p.description)}</p>
      <a class="more" href="/blog/${p.slug}/" aria-label="Ler: ${esc(p.title)}">Ler o artigo</a>
    </li>`,
    )
    .join("\n    ");
  return `${head({ title: "Blog · WACrew: atendimento no WhatsApp com IA", description: SITE.blogDescription, canonical, ogType: "website", ld })}
<body>
${topbar("blog")}
<main id="conteudo" class="read">
  <nav aria-label="Trilha">${crumbs(trail)}</nav>
  <div class="blog-head">
    <h1>Blog do WACrew</h1>
    <p>${esc(SITE.blogDescription)}</p>
  </div>
  <ul class="posts">
    ${items}
  </ul>
  ${ctaBlock()}
</main>
${footer()}`;
}

// ---------------------------------------------------------------- arquivos de máquina

function renderSitemap(entries) {
  const urls = entries
    .map((e) => `  <url>\n    <loc>${xml(e.loc)}</loc>\n    <lastmod>${e.lastmod}</lastmod>\n  </url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function renderRobots() {
  return `# wacrew.com.br: tudo liberado, inclusive buscadores e assistentes de IA
# (GPTBot, ChatGPT-User, PerplexityBot, ClaudeBot, Google-Extended, Bingbot).
User-agent: *
Allow: /

Sitemap: ${SITE.url}/sitemap.xml
`;
}

function renderFeed(posts) {
  const items = posts
    .map(
      (p) => `    <item>
      <title>${xml(p.title)}</title>
      <link>${SITE.url}/blog/${p.slug}/</link>
      <guid isPermaLink="true">${SITE.url}/blog/${p.slug}/</guid>
      <pubDate>${rfc822(p.date)}</pubDate>
      <dc:creator>${xml(SITE.author.name)}</dc:creator>
      <description>${xml(p.description)}</description>
      <content:encoded><![CDATA[${absolutize(p.html).replace(/]]>/g, "]]]]><![CDATA[>")}]]></content:encoded>
    </item>`,
    )
    .join("\n");
  const last = posts.length ? rfc822(posts.map((p) => p.updated).sort().at(-1)) : new Date().toUTCString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${xml(SITE.blogTitle)}</title>
    <link>${SITE.url}/blog/</link>
    <atom:link href="${SITE.url}/feed.xml" rel="self" type="application/rss+xml"/>
    <description>${xml(SITE.blogDescription)}</description>
    <language>pt-BR</language>
    <lastBuildDate>${last}</lastBuildDate>
${items}
  </channel>
</rss>
`;
}

// Leitor de feed não resolve caminho relativo: troca "/x" por "https://wacrew.com.br/x".
const absolutize = (html) => html.replace(/(href|src)="\/(?!\/)/g, `$1="${SITE.url}/`);

function renderLlms(posts) {
  const postLines = posts
    .map((p) => `- [${p.title}](${SITE.url}/blog/${p.slug}/index.md): ${p.description}`)
    .join("\n");
  return `# WACrew

> WACrew é uma automação de WhatsApp com IA, de código aberto (Apache 2.0), para quem atende clientes em grupos e conversas individuais. Junta tudo numa fila por tempo de espera, escreve as respostas na voz do dono, entrega no ritmo de uma pessoa e expõe um servidor MCP com 36 ferramentas para Claude Code, Codex e outros clientes MCP.

Fatos para citar com precisão:

- Público: donos de agência, software house e prestadores de serviço que atendem clientes em grupos de WhatsApp, e devs que usam agentes de código.
- Fila de atendimento ordenada por tempo de espera. Grupo e conversa individual do mesmo cliente aparecem juntos; mensagens seguidas viram um bloco; áudio chega transcrito.
- A IA escreve com a pontuação, as aberturas e o ritmo medidos nas mensagens do próprio dono. Uma revisão em código barra clichê de robô, desculpa repetida e balão igual ao anterior antes do envio.
- Entrega no ritmo humano: visto, digitando e pausa. A entrega para sozinha se o cliente escrever de novo ou se o dono responder pelo celular.
- Modo Confirmar (padrão: nada sai sem aprovação) e modo Autônomo, ligado conversa por conversa. Cada mensagem registra quem escreveu.
- Também tem CRM de clientes (contrato, entregas, etiquetas), escritório 2D em pixel art ao vivo, painel de métricas, Google Agenda no painel e equipe com acesso por conversa.
- Roda local (Node.js 20+; transcrição MLX no Apple Silicon ou por API) ou 24 horas com o Dockerfile incluso (Railway ou outro servidor).
- Limites: não é a API oficial do WhatsApp. Conecta como um aparelho a mais na conta, via Baileys (WhatsApp Web multidispositivo). Foi feito para atender quem já fala com você; disparo em massa e abordagem fria podem bloquear o número. Não importa histórico anterior ao pareamento.
- Preço: o código é grátis. Paga-se o uso da IA no provedor escolhido (com a própria chave) e o servidor, se rodar na nuvem.
- Uso real (novembro de 2026): 3.209 mensagens de clientes em 30 dias, 3 min de mediana até a primeira resposta, 24 entregas registradas no mês.
- Projeto independente, sem vínculo com o WhatsApp ou a Meta. Autor: Rodrigo Sumioshi.

## Produto

- [Página inicial](${SITE.url}/): visão geral, telas, instalação e perguntas frequentes.
- [Repositório no GitHub](${SITE.repo}): código, issues e releases.
- [README em português](${SITE.repo}/blob/main/README.pt-BR.md): o que faz, como funciona, ferramentas MCP e configuração.
- [README em inglês](${SITE.repo}/blob/main/README.md)

## Blog

${postLines}

## Opcional

- [API REST pública](${SITE.repo}/blob/main/docs/api-v1.md)
- [Como contribuir](${SITE.repo}/blob/main/CONTRIBUTING.md)
- [Licença Apache 2.0](${SITE.repo}/blob/main/LICENSE)
- [Feed RSS do blog](${SITE.url}/feed.xml)
`;
}

// ---------------------------------------------------------------- build

async function main() {
  const Marked = await loadMarked();
  const render = makeRenderer(Marked);

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  cpSync(SRC, OUT, {
    recursive: true,
    filter: (src) => !relative(SRC, src).startsWith(join("blog", "posts")) && !src.endsWith(".DS_Store"),
  });

  const posts = [];
  const slugs = new Set();
  if (existsSync(POSTS_DIR)) {
    for (const f of readdirSync(POSTS_DIR).filter((n) => n.endsWith(".md")).sort()) {
      const file = join(POSTS_DIR, f);
      const { data, body } = parseFrontMatter(readFileSync(file, "utf8"), f);
      if (data.draft === "true") continue;
      if (slugs.has(data.slug)) throw new Error(`slug repetido: ${data.slug}`);
      if (data.slug !== slugify(data.slug)) throw new Error(`${f}: slug inválido "${data.slug}"`);
      slugs.add(data.slug);
      const { html, headings } = render(body);
      const words = stripTags(html).split(/\s+/).filter(Boolean).length;
      posts.push({ ...data, body, html, headings, words, minutes: Math.max(1, Math.round(words / 200)) });
    }
  }
  posts.sort((a, b) => (a.date === b.date ? a.title.localeCompare(b.title) : b.date.localeCompare(a.date)));

  for (const p of posts) {
    const dir = join(OUT, "blog", p.slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), renderPost(p, posts));
    writeFileSync(
      join(dir, "index.md"),
      `# ${p.title}\n\n> ${p.description}\n\nPor ${SITE.author.name}, ${dataExtenso(p.date)}. Original: ${SITE.url}/blog/${p.slug}/\n\n${p.body.trim().replace(/\]\(\//g, `](${SITE.url}/`)}\n`,
    );
  }
  mkdirSync(join(OUT, "blog"), { recursive: true });
  writeFileSync(join(OUT, "blog", "index.html"), renderBlogIndex(posts));

  const newest = posts.map((p) => p.updated).sort().at(-1);
  const sitemap = [
    { loc: `${SITE.url}/`, lastmod: lastmodOf(join(SRC, "index.html")) },
    ...(posts.length ? [{ loc: `${SITE.url}/blog/`, lastmod: newest }] : []),
    ...posts.map((p) => ({ loc: `${SITE.url}/blog/${p.slug}/`, lastmod: p.updated })),
  ];
  writeFileSync(join(OUT, "sitemap.xml"), renderSitemap(sitemap));
  writeFileSync(join(OUT, "robots.txt"), renderRobots());
  writeFileSync(join(OUT, "feed.xml"), renderFeed(posts));
  writeFileSync(join(OUT, "llms.txt"), renderLlms(posts));
  writeFileSync(join(OUT, "CNAME"), "wacrew.com.br\n");

  const size = (d) => readdirSync(d).reduce((n, f) => {
    const p = join(d, f);
    return n + (statSync(p).isDirectory() ? size(p) : 1);
  }, 0);
  console.log(`_site pronto: ${posts.length} post(s), ${size(OUT)} arquivos`);
  for (const p of posts) console.log(`  /blog/${p.slug}/  ${p.words} palavras`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
