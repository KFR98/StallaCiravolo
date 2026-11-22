/**
 * Link d'invito Discord accettati: solo https e solo domini ufficiali di Discord,
 * così dal pannello non si può trasformare il logo in un link verso siti esterni (phishing).
 */
const HOSTS = new Set(["discord.gg", "discord.com", "www.discord.com", "discordapp.com", "www.discordapp.com"]);

export function isDiscordInvite(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port || !HOSTS.has(u.hostname)) return false;
  if (u.hostname === "discord.gg") return /^\/[A-Za-z0-9-]{2,32}\/?$/.test(u.pathname);
  return /^\/invite\/[A-Za-z0-9-]{2,32}\/?$/.test(u.pathname);
}

/** Il link da mostrare, oppure null se vuoto o non valido. */
export function discordLink(raw: string | null | undefined): string | null {
  const v = raw?.trim();
  return v && isDiscordInvite(v) ? v : null;
}
