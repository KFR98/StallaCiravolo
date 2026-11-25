import { test } from "node:test";
import assert from "node:assert/strict";
import { base32Encode, base32Decode, totpAt, verifyTotp, newTotpSecret, recoveryHash, newRecoveryCodes } from "../src/lib/totp";

// Segreto di prova dello standard RFC 6238 ("12345678901234567890")
const RFC = base32Encode(Buffer.from("12345678901234567890"));

test("TOTP: base32 andata e ritorno", () => {
  assert.equal(RFC, "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  assert.equal(base32Decode(RFC).toString(), "12345678901234567890");
  const s = newTotpSecret();
  assert.equal(s.length, 32);
  assert.equal(base32Encode(base32Decode(s)), s);
});

test("TOTP: valori ufficiali RFC 6238 (ultime 6 cifre)", () => {
  assert.equal(totpAt(RFC, Math.floor(59 / 30)), "287082");
  assert.equal(totpAt(RFC, Math.floor(1111111109 / 30)), "081804");
  assert.equal(totpAt(RFC, Math.floor(1234567890 / 30)), "005924");
  assert.equal(totpAt(RFC, Math.floor(2000000000 / 30)), "279037");
});

test("TOTP: accetta ±30 secondi, rifiuta codici vecchi e riusati", () => {
  const now = 1111111109 * 1000;
  assert.equal(verifyTotp(RFC, "081804", null, now), Math.floor(1111111109 / 30));
  assert.notEqual(verifyTotp(RFC, totpAt(RFC, Math.floor(1111111109 / 30) - 1), null, now), null); // 30 s prima
  assert.equal(verifyTotp(RFC, totpAt(RFC, Math.floor(1111111109 / 30) - 3), null, now), null); // 90 s prima: no
  assert.equal(verifyTotp(RFC, "081804", Math.floor(1111111109 / 30), now), null); // già usato
  assert.equal(verifyTotp(RFC, "12345", null, now), null);
  assert.equal(verifyTotp(RFC, "abcdef", null, now), null);
});

test("Codici di recupero: 10, diversi, impronta indipendente da trattini e maiuscole", () => {
  const c = newRecoveryCodes();
  assert.equal(c.length, 10);
  assert.equal(new Set(c).size, 10);
  assert.match(c[0], /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  assert.equal(recoveryHash(c[0]), recoveryHash(c[0].toLowerCase().replace("-", " ")));
});
