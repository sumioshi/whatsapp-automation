import type { MetadataRoute } from "next";

/** Manifest de PWA: torna o painel instalável (Dock do Mac, janela própria). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Balcão",
    short_name: "Balcão",
    description: "Atendimento dos clientes no WhatsApp.",
    start_url: "/",
    display: "standalone",
    background_color: "#eef0f3",
    theme_color: "#eef0f3",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
