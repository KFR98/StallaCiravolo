import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/permissions";
import { PageHeader, Card } from "@/components/ui";
import { UserTotalsCards, UserHistoryList, type HistorySearch } from "@/components/UserHistory";
import { AccountForm } from "./AccountForm";

export const metadata = { title: "Il mio profilo" };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<HistorySearch> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
  return (
    <>
      <PageHeader eyebrow={ROLE_LABELS[user.role]} title={user.displayName} subtitle={`@${user.username}`} />
      <UserTotalsCards userId={user.id} />
      <div className="grid gap-5 xl:grid-cols-[1.7fr_1fr]">
        <UserHistoryList userId={user.id} sp={sp} basePath="/profilo" />
        <Card title="Il mio account" className="h-fit">
          <AccountForm username={user.username} displayName={user.displayName} isAdmin={user.role === "ADMIN"} />
        </Card>
      </div>
    </>
  );
}
