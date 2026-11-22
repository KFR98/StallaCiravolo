import { lookup } from "node:dns";
import net from "node:net";
import https from "node:https";

/**
 * Scarica un'immagine da un indirizzo https indicato dall'admin.
 * Protezioni: solo https, niente indirizzi interni (SSRF) controllati AL MOMENTO DELLA CONNESSIONE
 * (così un dominio non può rispondere con un indirizzo pubblico al controllo e interno alla connessione:
 * "DNS rebinding"), dimensione massima, massimo 3 reindirizzamenti, 20 secondi.
 */
const DEFAULT_MAX = 8 * 1024 * 1024;

function v4Private(ip: string) {
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}
export function privateIp(ip: string) {
  if (net.isIPv4(ip)) return v4Private(ip);
  const v = ip.toLowerCase();
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return v4Private(mapped[1]);
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb") || v.startsWith("::ffff:") || v.startsWith("64:ff9b:");
}

/** Risoluzione DNS usata dalla connessione: rifiuta qualsiasi indirizzo interno. */
const safeLookup: net.LookupFunction = (hostname, options, cb) => {
  lookup(hostname, { ...options, all: true }, (err, addrs) => {
    if (err) return cb(err, "", 4);
    const list = (addrs as unknown as { address: string; family: number }[]) ?? [];
    if (!list.length || list.some((a) => privateIp(a.address))) return cb(new Error("indirizzo non consentito"), "", 4);
    const first = list[0];
    if ((options as { all?: boolean }).all) return (cb as unknown as (e: null, a: typeof list) => void)(null, list);
    cb(null, first.address, first.family);
  });
};

function checkUrl(raw: string) {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("indirizzo non valido");
  }
  if (u.protocol !== "https:") throw new Error("serve un indirizzo https");
  if (u.username || u.password) throw new Error("indirizzo non valido");
  if (net.isIP(u.hostname.replace(/^\[|\]$/g, "")) && privateIp(u.hostname.replace(/^\[|\]$/g, ""))) throw new Error("indirizzo non consentito");
  return u;
}

function get(u: URL, max: number): Promise<{ status: number; location?: string; body?: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = https.get(u, { lookup: safeLookup, timeout: 20_000, headers: { "User-Agent": "Mozilla/5.0 (compatible; gestionale-stalla)", Accept: "image/*" } }, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400) {
        res.resume();
        return resolve({ status, location: res.headers.location });
      }
      if (status < 200 || status >= 300) {
        res.resume();
        return reject(new Error(`il sito ha risposto ${status}`));
      }
      if (Number(res.headers["content-length"] || 0) > max) {
        res.destroy();
        return reject(new Error(`immagine troppo grande (massimo ${Math.round(max / 1048576)} MB)`));
      }
      const chunks: Buffer[] = [];
      let n = 0;
      res.on("data", (c: Buffer) => {
        n += c.length;
        if (n > max) {
          res.destroy();
          reject(new Error(`immagine troppo grande (massimo ${Math.round(max / 1048576)} MB)`));
        } else chunks.push(c);
      });
      res.on("end", () => resolve({ status, body: Buffer.concat(chunks) }));
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("il sito non risponde")));
    req.on("error", (e) => reject(e.message === "indirizzo non consentito" ? e : new Error(e.message.includes("non consentito") ? "indirizzo non consentito" : "sito non raggiungibile")));
  });
}

export async function fetchRemoteImage(raw: string, MAX = DEFAULT_MAX): Promise<Buffer> {
  let url = checkUrl(raw.trim());
  for (let i = 0; i < 4; i++) {
    const r = await get(url, MAX);
    if (r.location) {
      url = checkUrl(new URL(r.location, url).toString());
      continue;
    }
    if (!r.body) throw new Error("risposta vuota");
    return r.body;
  }
  throw new Error("troppi reindirizzamenti");
}
