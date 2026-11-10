import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Accesso" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="panel w-full max-w-[420px] rise">
        <div className="px-6 pt-8 pb-6 text-center sm:px-8">
          <div className="title-fell text-[13px] tracking-[0.35em] text-ink-soft uppercase">Registro ufficiale</div>
          <h1 className="title-western mt-2 text-[34px] leading-none text-leather">Stalla Ciravolo</h1>
          <div className="ornament my-4 title-fell text-[12px] tracking-[0.3em] uppercase">Est. 1899</div>
          <LoginForm />
          <p className="mt-6 text-[14px] text-ink-soft italic">Gli account vengono rilasciati dall&apos;amministrazione della stalla.</p>
        </div>
      </div>
    </main>
  );
}
