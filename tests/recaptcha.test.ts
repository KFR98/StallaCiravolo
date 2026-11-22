import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyToken } from "../src/lib/recaptcha-verify";

const realFetch = globalThis.fetch;
function mock(reply: unknown, status = 200) {
  const calls: URLSearchParams[] = [];
  globalThis.fetch = (async (_url: string, init: { body: URLSearchParams }) => {
    calls.push(init.body);
    return new Response(JSON.stringify(reply), { status });
  }) as unknown as typeof fetch;
  return calls;
}
const base = { token: "tok", secret: "segreta", minScore: 0.5, ip: "1.2.3.4", action: "login" } as const;

test("reCAPTCHA: token vuoto rifiutato senza chiamare Google", async () => {
  const calls = mock({ success: true });
  assert.equal((await verifyToken({ ...base, token: "  ", version: "v2" })).ok, false);
  assert.equal(calls.length, 0);
  globalThis.fetch = realFetch;
});

test("reCAPTCHA v2: successo e invio di segreta, token e IP", async () => {
  const calls = mock({ success: true });
  assert.equal((await verifyToken({ ...base, version: "v2" })).ok, true);
  assert.equal(calls[0].get("secret"), "segreta");
  assert.equal(calls[0].get("response"), "tok");
  assert.equal(calls[0].get("remoteip"), "1.2.3.4");
  globalThis.fetch = realFetch;
});

test("reCAPTCHA v2: risposta negativa di Google", async () => {
  mock({ success: false, "error-codes": ["invalid-input-response"] });
  const r = await verifyToken({ ...base, version: "v2" });
  assert.equal(r.ok, false);
  globalThis.fetch = realFetch;
});

test("reCAPTCHA v3: punteggio e azione controllati", async () => {
  mock({ success: true, score: 0.9, action: "login" });
  assert.equal((await verifyToken({ ...base, version: "v3" })).ok, true);
  mock({ success: true, score: 0.2, action: "login" });
  assert.equal((await verifyToken({ ...base, version: "v3" })).ok, false);
  mock({ success: true, score: 0.9, action: "altro" });
  assert.equal((await verifyToken({ ...base, version: "v3" })).ok, false);
  globalThis.fetch = realFetch;
});

test("reCAPTCHA: Google irraggiungibile = accesso negato (fail closed)", async () => {
  globalThis.fetch = (async () => { throw new Error("rete giù"); }) as unknown as typeof fetch;
  const r = await verifyToken({ ...base, version: "v2" });
  assert.equal(r.ok, false);
  assert.equal("unavailable" in r && r.unavailable, true);
  mock({}, 500);
  assert.equal((await verifyToken({ ...base, version: "v2" })).ok, false);
  globalThis.fetch = realFetch;
});
