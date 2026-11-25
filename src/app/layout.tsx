import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { getSettings } from "@/lib/settings";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Stalla Ciravolo", template: "%s · Stalla Ciravolo" },
  description: "Gestionale della Stalla Ciravolo",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0a09" },
    { media: "(prefers-color-scheme: light)", color: "#f4f0e8" },
  ],
};

// Applica il tema prima del primo disegno (niente lampeggio)
const themeScript = `(function(){try{var t=localStorage.getItem('tema');var d=t?t==='scuro':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  // colori di rari e leggendari scelti in Impostazioni (usati da card, badge, moduli)
  const st = await getSettings().catch(() => null);
  const hex = (c: unknown, d: string) => (typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c) ? c : d);
  const sl = st?.saleLabelColors;
  const themeVars = {
    "--rare": hex(st?.rareColor, "#7c3aed"), "--legend": hex(st?.legendaryColor, "#c99a1c"),
    // etichette delle vendite (Impostazioni → Etichette delle vendite)
    "--sale-cavallo": hex(sl?.cavallo, "#1d5f8f"), "--sale-addestramento": hex(sl?.addestramento, "#1f7a3d"),
    "--sale-vetrina": hex(sl?.vetrina, "#b7791f"), "--sale-blip": hex(sl?.blip, "#78716c"),
  } as React.CSSProperties;
  return (
    <html lang="it" suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh" style={themeVars}>
        {children}
        <Toaster
          position="top-center"
          richColors
          closeButton
          toastOptions={{ classNames: { toast: "!font-sans !text-[14.5px] !rounded-lg" } }}
        />
      </body>
    </html>
  );
}
