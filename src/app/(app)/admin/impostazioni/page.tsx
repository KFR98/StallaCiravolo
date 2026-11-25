import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { allRoles } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { prisma } from "@/lib/db";
import { AdminTabs } from "../AdminTabs";
import { PageHeader, Card } from "@/components/ui";
import { SettingsForm } from "./SettingsForm";
import { RecaptchaForm } from "./RecaptchaForm";
import { headers } from "next/headers";
import { emergencyOff, getSecret } from "@/lib/recaptcha";

export const metadata = { title: "Impostazioni" };

export default async function SettingsPage() {
  const me = await requireUser("settings.manage");
  const [s, inStable, shopItems, secret] = await Promise.all([
    getSettings(),
    prisma.horse.count({ where: { status: "IN_STALLA" } }),
    prisma.shopItem.findMany({ where: { kind: "VENDITA", archived: false }, orderBy: [{ group: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    getSecret(),
  ]);
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <>
      <PageHeader title="Amministrazione" subtitle="Parametri di funzionamento della stalla. Ogni modifica viene registrata." />
      <AdminTabs role={me.role} active="impostazioni" />
      <Card>
        <SettingsForm s={s} inStable={inStable} shopItems={shopItems} roles={allRoles().map((r) => ({ key: r.key, name: r.name }))} />
      </Card>
      <Card title="Mappa degli spawn in alta definizione" className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-[14px] text-fg-2">Carica l&apos;immagine grande della mappa, genera i tasselli per lo zoom e calibra i punti. Ha una pagina sua perché richiede più passaggi.</p>
          <Link href="/admin/mappa" className="btn btn-secondary">Apri la mappa HD →</Link>
        </div>
      </Card>
      <Card title="reCAPTCHA sulla pagina di accesso" className="mt-5">
        <p className="mb-4 text-[14px] text-fg-2">
          Blocca i programmi automatici che provano a indovinare le password. Le chiavi si creano gratis su
          {" "}<b>google.com/recaptcha/admin</b>, aggiungendo il dominio del gestionale.
        </p>
        <RecaptchaForm
          enabled={s.recaptchaEnabled}
          version={s.recaptchaVersion}
          siteKey={s.recaptchaSiteKey}
          minScore={s.recaptchaMinScore}
          secretSet={!!secret}
          emergency={emergencyOff()}
          nonce={nonce}
        />
      </Card>
    </>
  );
}
