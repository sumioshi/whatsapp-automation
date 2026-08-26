import type { MetadataRoute } from "next";

/** Manifest de PWA: torna o painel instalável (Dock do Mac, janela própria). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Signal Room",
    short_name: "Signal Room",
    description: "Central de triagem dos grupos de WhatsApp.",
    start_url: "/clientes",
    display: "standalone",
    background_color: "#08090a",
    theme_color: "#08090a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
