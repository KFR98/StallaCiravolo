import { Trophy } from "lucide-react";
import { weeklyRanking, SCORE_RULES } from "@/lib/stats";
import { addWeeks, weekStartOf, weekLabel } from "@/lib/weeks";
import { money, TZ } from "@/lib/format";

/** Stalliere della settimana (in corso) e vincitore della settimana scorsa. */
export async function WeeklyChampion() {
  const week = weekStartOf(new Date(), TZ);
  const [now, last] = await Promise.all([weeklyRanking(week, addWeeks(week, 1, TZ)), weeklyRanking(addWeeks(week, -1, TZ), week)]);
  const leader = now[0];
  const prev = last[0];
  return (
    <div className="card relative overflow-hidden p-4 sm:p-5">
      <div className="pointer-events-none absolute -top-10 -right-10 size-40 rounded-full bg-warn-strong/10" />
      <div className="flex items-start gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-warn-strong text-black"><Trophy size={24} /></span>
        <div className="min-w-0 flex-1">
          <div className="eyebrow">Stalliere della settimana · {weekLabel(week, TZ)}</div>
          {leader ? (
            <>
              <div className="h-display mt-0.5 truncate text-[26px]">{leader.name}</div>
              <div className="text-[13.5px] text-fg-2">
                <b>{leader.score} punti</b> · {leader.captures} catture · {leader.stableSales + leader.govSales} vendite · {money(leader.revenue + leader.itemsRevenue)}
              </div>
            </>
          ) : (
            <div className="mt-1 text-fg-3">Nessuna attività ancora questa settimana.</div>
          )}
          {now.length > 1 && (
            <ol className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-fg-3">
              {now.slice(1, 4).map((e, i) => <li key={e.userId}>{i + 2}. {e.name} · {e.score} pt</li>)}
            </ol>
          )}
          {prev && <div className="mt-2 text-[13px] text-fg-3">Settimana scorsa: <b className="text-fg">{prev.name}</b> ({prev.score} punti)</div>}
        </div>
      </div>
      <p className="mt-3 text-[12px] text-fg-3">
        Punti: {SCORE_RULES.capture} per cattura · {SCORE_RULES.stableSale} per vendita in stalla · {SCORE_RULES.govSale} per vendita al blip · {SCORE_RULES.itemSale} per vendita di oggetti · {SCORE_RULES.per100} ogni $100 incassati.
      </p>
    </div>
  );
}
