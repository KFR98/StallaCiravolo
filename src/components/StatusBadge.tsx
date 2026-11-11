import { STATUS_LABEL } from "@/lib/horses";

export function StatusBadge({ status }: { status: keyof typeof STATUS_LABEL }) {
  const cls = status === "IN_STALLA" ? "badge-ok" : status === "VENDUTO" ? "badge-accent" : status === "VENDUTO_GOVERNO" ? "badge-info" : "badge-neutral";
  return <span className={`badge ${cls}`}>{STATUS_LABEL[status]}</span>;
}

export function SaleTypeBadge({ type }: { type: "STALLA" | "GOVERNO" }) {
  return <span className={`badge ${type === "GOVERNO" ? "badge-info" : "badge-neutral"}`}>{type === "GOVERNO" ? "Blip Governo" : "Stalla"}</span>;
}

/** Etichetta arancione "INCINTA" / "FAI PARTORIRE". */
export function PregnancyBadge({ dueAt }: { dueAt: Date | string | null | undefined }) {
  if (!dueAt) return null;
  const due = new Date(dueAt).getTime() <= Date.now();
  return due ? (
    <span className="badge badge-solid-warn pulse-soft">FAI PARTORIRE</span>
  ) : (
    <span className="badge badge-solid-warn">INCINTA</span>
  );
}
