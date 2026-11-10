import { requireUser } from "@/lib/auth";
import { getBreedOptions } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui";
import { CaptureForm } from "./CaptureForm";

export const metadata = { title: "Registra cattura" };

export default async function NewHorsePage({ searchParams }: { searchParams: Promise<{ coat?: string }> }) {
  await requireUser("horses.capture");
  const [breeds, s, sp] = await Promise.all([getBreedOptions(), getSettings(), searchParams]);
  return (
    <>
      <PageHeader title="Registra cattura" subtitle="Compila il modulo e scegli: deposita in stalla oppure vendi subito al Governo." />
      <CaptureForm breeds={breeds} defaultAge={s.defaultCaptureAge} initialCoatId={sp.coat ? Number(sp.coat) : undefined} minSaleAge={s.minSaleAge} />
    </>
  );
}
