import clsx from "clsx";
import { STATUS_LABEL } from "@/lib/horses";

export function StatusBadge({ status }: { status: keyof typeof STATUS_LABEL }) {
  const cls = status === "IN_STALLA" ? "badge-green" : status === "VENDUTO" ? "badge-gold" : status === "VENDUTO_GOVERNO" ? "badge-blue" : "badge-ink";
  return <span className={clsx("badge", cls)}>{STATUS_LABEL[status]}</span>;
}

export function SaleTypeBadge({ type }: { type: "STALLA" | "GOVERNO" }) {
  return <span className={clsx("badge", type === "GOVERNO" ? "badge-blue" : "badge-gold")}>{type === "GOVERNO" ? "Governo" : "Stalla"}</span>;
}
