import { Tabs } from "@/components/ui";

export function CatalogTabs({ active }: { active: "catalogo" | "confronto" | "listino" }) {
  return (
    <Tabs active={active} items={[
      { key: "catalogo", href: "/catalogo", label: "Catalogo" },
      { key: "confronto", href: "/confronto", label: "Confronto cavalli" },
      { key: "listino", href: "/listino", label: "Listino prezzi" },
    ]} />
  );
}
