export type StatRow = { label: string; value: number | null; max: number };

/** Barre statistiche in stile RDR2. Il massimo di ogni colonna è il valore più alto del catalogo. */
export function StatBars({ stats, compact = false }: { stats: StatRow[]; compact?: boolean }) {
  return (
    <div className={compact ? "space-y-1.5" : "space-y-2.5"}>
      {stats.map((s) => {
        const pct = s.value == null || !s.max ? 0 : Math.min(100, (s.value / s.max) * 100);
        return (
          <div key={s.label} className="grid grid-cols-[78px_1fr_34px] items-center gap-2">
            <span className="title-fell truncate text-[12.5px] tracking-[0.08em] text-ink-soft uppercase">{s.label}</span>
            <div className="statbar" title={s.value == null ? "Non disponibile" : `${s.value} / ${s.max}`}>
              <span style={{ width: `${pct}%` }} />
            </div>
            <span className="text-right text-[14px] font-semibold tabular-nums">
              {s.value == null ? <span className="text-ink-soft/60">—</span> : s.value.toLocaleString("it-IT")}
            </span>
          </div>
        );
      })}
    </div>
  );
}
