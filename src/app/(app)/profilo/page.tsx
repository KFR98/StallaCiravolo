import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { roleLabel } from "@/lib/permissions";
import { PageHeader, Card } from "@/components/ui";
import { UserTotalsCards, UserHistoryList, type HistorySearch } from "@/components/UserHistory";
import { AccountForm } from "./AccountForm";
import { TwoFactorCard } from "./TwoFactorCard";
import { getSettings } from "@/lib/settings";
import { roleRequires2fa } from "@/lib/two-factor";

export const metadata = { title: "Il mio profilo" };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<HistorySearch> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
  return (
    <>
      <PageHeader eyebrow={roleLabel(user.role)} title={user.displayName} subtitle={`@${user.username}`} />
      <UserTotalsCards userId={user.id} />
      <div className="grid gap-5 xl:grid-cols-[1.7fr_1fr]">
        <UserHistoryList userId={user.id} sp={sp} basePath="/profilo" />
        <div className="h-fit space-y-5">
          <Card title="Il mio account">
            <AccountForm username={user.username} displayName={user.displayName} isAdmin={user.role === "ADMIN"} />
          </Card>
          <Card title="Doppia verifica">
            <TwoFactorCard
              enabled={!!user.totpEnabledAt}
              enabledAt={user.totpEnabledAt?.toISOString() ?? null}
              required={roleRequires2fa(user.role, await getSettings())}
              recoveryLeft={(() => { try { return (JSON.parse(user.totpRecovery ?? "[]") as string[]).length; } catch { return 0; } })()}
            />
          </Card>
        </div>
      </div>
    </>
  );
}
