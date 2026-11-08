import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CRM Lojas",
    short_name: "CRM",
    description: "Leads, tarefas e avisos das lojas",
    start_url: "/",
    display: "standalone",
    lang: "pt-BR",
    background_color: "#ffffff",
    theme_color: "#171717",
    icons: [
      { src: "/icones/192", sizes: "192x192", type: "image/png" },
      { src: "/icones/512", sizes: "512x512", type: "image/png" },
      { src: "/icones/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
