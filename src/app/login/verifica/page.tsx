import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { getSettings } from "@/lib/settings";
import { open } from "@/lib/secret-box";
import { otpauthUrl } from "@/lib/totp";
import { getPending, userForPending } from "@/lib/two-factor";
import { VerifyForm } from "./VerifyForm";

export const metadata = { title: "Doppia verifica" };

/** Secondo passo dell'accesso: codice dell'app, oppure attivazione della doppia verifica al primo accesso. */
export default async function VerifyPage() {
  const p = await getPending();
  if (!p) redirect("/login");
  const user = await userForPending(p);
  if (!user) redirect("/login");
  const s = await getSettings();
  let enroll: { qr: string; secret: string } | null = null;
  let codes: string[] | null = null;
  if (p.mode === "codes") {
    try { codes = JSON.parse((p.codes && open(p.codes)) || "null"); } catch { codes = null; }
    if (!codes) redirect("/login");
  }
  if (p.mode === "enroll") {
    const secret = p.secret ? open(p.secret) : null;
    if (!secret) redirect("/login");
    // QR come SVG generato qui sul server: nessuno script esterno, nessun servizio online
    const qr = await QRCode.toString(otpauthUrl(secret, user.username, s.stableName), { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } });
    enroll = { qr, secret };
  }
  return (
    <main className="relative flex min-h-dvh items-center justify-center bg-[#0b0a09] p-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_500px_at_50%_0%,rgba(200,22,29,0.18),transparent_70%)]" />
      <div className="card relative w-full max-w-[440px] p-7 sm:p-8">
        <div className="mb-5 text-center">
          <div className="font-brand text-[26px] leading-none">{s.stableName}</div>
          <div className="mt-2 font-display text-[12px] font-semibold tracking-[0.3em] text-accent-text uppercase">Doppia verifica</div>
        </div>
        <VerifyForm name={user.displayName} enroll={enroll} codes={codes} />
      </div>
    </main>
  );
}
