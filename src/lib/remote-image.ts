import { lookup } from "node:dns/promises";
import net from "node:net";

/**
 * Scarica un'immagine da un indirizzo https indicato dall'admin.
 * Protezioni: solo https, niente indirizzi interni (SSRF), massimo 8 MB, massimo 3 reindirizzamenti, 20 s.
 */
const DEFAULT_MAX = 8 * 1024 * 1024;

function privateIp(ip: string) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:127.") || v.startsWith("::ffff:10.") || v.startsWith("::ffff:192.168.");
}

async function checkUrl(raw: string) {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("indirizzo non valido");
  }
  if (u.protocol !== "https:") throw new Error("serve un indirizzo https");
  if (u.username || u.password) throw new Error("indirizzo non valido");
  const addrs = await lookup(u.hostname, { all: true }).catch(() => []);
  if (!addrs.length) throw new Error("sito non raggiungibile");
  if (addrs.some((a) => privateIp(a.address))) throw new Error("indirizzo non consentito");
  return u;
}

export async function fetchRemoteImage(raw: string, MAX = DEFAULT_MAX): Promise<Buffer> {
  let url = await checkUrl(raw.trim());
  for (let i = 0; i < 4; i++) {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(20_000), headers: { "User-Agent": "Mozilla/5.0 (compatible; gestionale-stalla)", Accept: "image/*" } });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error("reindirizzamento non valido");
      url = await checkUrl(new URL(loc, url).toString());
      continue;
    }
    if (!res.ok) throw new Error(`il sito ha risposto ${res.status}`);
    if (Number(res.headers.get("content-length") || 0) > MAX) throw new Error(`immagine troppo grande (massimo ${Math.round(MAX / 1048576)} MB)`);
    const reader = res.body?.getReader();
    if (!reader) throw new Error("risposta vuota");
    const chunks: Uint8Array[] = [];
    let n = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.length;
      if (n > MAX) { await reader.cancel(); throw new Error(`immagine troppo grande (massimo ${Math.round(MAX / 1048576)} MB)`); }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  }
  throw new Error("troppi reindirizzamenti");
}
