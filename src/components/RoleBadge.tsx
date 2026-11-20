import { roleLabel, getRole } from "@/lib/permissions";
export function RoleBadge({ role }: { role: string }) {
  const c = getRole(role)?.color ?? "#78716c";
  return (
    <span className="badge badge-neutral gap-1.5">
      <span className="inline-block size-2.5 rounded-full" style={{ background: /^#[0-9a-f]{6}$/i.test(c) ? c : "#78716c" }} />
      {roleLabel(role)}
    </span>
  );
}
