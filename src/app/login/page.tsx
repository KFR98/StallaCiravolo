import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { LoginForm } from "./LoginForm";
import { ThemeToggle } from "@/components/ThemeToggle";

export const metadata = { title: "Accesso" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  const name = await getSetting("stableName");
  return (
    <main className="relative flex min-h-dvh items-center justify-center bg-[#0b0a09] p-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_500px_at_50%_0%,rgba(200,22,29,0.18),transparent_70%)]" />
      <div className="absolute top-4 right-4"><ThemeToggle className="!text-neutral-300" /></div>
      <div className="card relative w-full max-w-[400px] p-7 sm:p-8">
        <div className="mb-6 text-center">
          <div className="font-brand text-[30px] leading-none">{name}</div>
          <div className="mt-2 font-display text-[12px] font-semibold tracking-[0.3em] text-accent-text uppercase">Gestionale stalla</div>
        </div>
        <LoginForm />
        <p className="mt-6 text-center text-[13px] text-fg-3">Gli account vengono creati dall&apos;amministrazione.</p>
      </div>
    </main>
  );
}
