export type StatRow = { label: string; value: number | null; max: number };

/** Barre statistiche: il massimo di ogni colonna è il valore del cavallo migliore del catalogo. */
export function StatBars({ stats, compact = false }: { stats: StatRow[]; compact?: boolean }) {
  return (
    <dl className={compact ? "space-y-1.5" : "space-y-2.5"}>
      {stats.map((s) => {
        const pct = s.value == null || !s.max ? 0 : Math.min(100, (s.value / s.max) * 100);
        return (
          <div key={s.label} className="grid grid-cols-[72px_1fr_32px] items-center gap-2.5">
            <dt className="truncate text-[12px] font-semibold tracking-wide text-fg-3 uppercase">{s.label}</dt>
            <div className="statbar" role="meter" aria-label={s.label} aria-valuemin={0} aria-valuemax={s.max} aria-valuenow={s.value ?? 0}>
              <span style={{ width: `${pct}%` }} />
            </div>
            <dd className="text-right text-[13.5px] font-semibold tabular-nums">{s.value == null ? <span className="text-fg-3">—</span> : s.value.toLocaleString("it-IT")}</dd>
          </div>
        );
      })}
    </dl>
  );
}

/** Voto complessivo 0-10 e stelle 0-5. */
export function Rating({ score, showNumber = true }: { score: number | null; showNumber?: boolean }) {
  if (score == null) return <span className="text-fg-3">—</span>;
  const stars = Math.round(score) / 2; // 0..5 a mezze stelle
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" title={`Voto ${score.toFixed(1)} su 10`}>
      <span className="inline-flex text-warn-strong" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => {
          const fill = Math.max(0, Math.min(1, stars - i));
          return (
            <svg key={i} width="14" height="14" viewBox="0 0 24 24">
              <defs>
                <linearGradient id={`g${i}-${Math.round(fill * 100)}`}>
                  <stop offset={`${fill * 100}%`} stopColor="currentColor" />
                  <stop offset={`${fill * 100}%`} stopColor="var(--bar-track)" />
                </linearGradient>
              </defs>
              <path fill={`url(#g${i}-${Math.round(fill * 100)})`} d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z" />
            </svg>
          );
        })}
      </span>
      {showNumber && <b className="tabular-nums">{score.toFixed(1)}</b>}
    </span>
  );
}
