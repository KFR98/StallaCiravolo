import type { NextConfig } from "next";

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Upload di immagini e del file Excel del listino
      bodySizeLimit: "20mb",
      // Dominio pubblico se il proxy non inoltra correttamente l'host (es. "stalla.miodominio.it")
      ...(allowedOrigins.length ? { allowedOrigins } : {}),
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          // La Content-Security-Policy è impostata nel middleware, con un "nonce" diverso a ogni
          // richiesta: così gli script del sito sono firmati e uno script iniettato non può partire.
        ],
      },
    ];
  },
};

export default nextConfig;
