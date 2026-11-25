import clsx from "clsx";

/** Pallino rosso della notifica, accanto alla cosa precisa che aspetta qualcuno. */
export function NoticeDot({ title, corner, className }: { title: string; corner?: boolean; className?: string }) {
  return <span className={clsx("notice-dot", corner && "notice-dot-corner", className)} role="img" aria-label={title} title={title} />;
}
