import clsx from "clsx";

/** Logo di Discord (il "Clyde" ufficiale). */
export function DiscordIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 127.14 96.36" width={size} height={Math.round(size * 0.76)} aria-hidden="true" className={className} fill="currentColor">
      <path d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15ZM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.43-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69Zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69Z" />
    </svg>
  );
}

/** Colori della pennellata scelti in Impostazioni. */
export const DISCORD_STYLES = [
  ["avorio", "Avorio con scritta nera"],
  ["rossa", "Rossa con scritta bianca"],
  ["nera", "Nera con scritta bianca"],
] as const;
export type DiscordStyle = (typeof DISCORD_STYLES)[number][0];

/**
 * Filtro "pennellata" (bordi sfrangiati come nei menu di Red Dead Redemption 2).
 * Va messo UNA volta nella pagina: le pennellate lo richiamano per nome.
 */
export function DiscordBrushDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" className="pointer-events-none absolute">
      <defs>
        <filter id="dc-brush" x="-5%" y="-30%" width="110%" height="160%">
          <feTurbulence type="fractalNoise" baseFrequency="0.02 0.5" numOctaves={3} seed={9} />
          <feDisplacementMap in="SourceGraphic" scale={12} />
        </filter>
      </defs>
    </svg>
  );
}

function Brush() {
  return (
    <svg className="discord-brush" viewBox="0 0 300 46" preserveAspectRatio="none" aria-hidden="true">
      <path d="M4 8 Q80 3 150 7 T298 6 L296 40 Q220 44 140 40 T2 42Z" filter="url(#dc-brush)" />
    </svg>
  );
}

/**
 * Pulsante "Server Discord" con la pennellata dietro.
 * variant "menu": nel menu scuro, la pennellata si accende passandoci sopra.
 * variant "login": pulsante pieno nella pagina di accesso.
 */
export function DiscordLink({ href, style, variant }: { href: string; style: DiscordStyle; variant: "menu" | "login" }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="Entra nel nostro server Discord"
      data-style={style}
      className={clsx("discord-link", variant === "menu" ? "discord-menu" : "discord-login")}
    >
      <Brush />
      <DiscordIcon size={variant === "menu" ? 22 : 24} className="discord-icon" />
      <span className="discord-text">{variant === "menu" ? "Server Discord" : "Discord"}</span>
    </a>
  );
}
