import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Todas as telas dependem do usuário logado: renderização dinâmica clássica, sem Cache Components.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
