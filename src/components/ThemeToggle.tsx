"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [dark, setDark] = useState<boolean | null>(null);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  const toggle = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("tema", next ? "scuro" : "chiaro");
    } catch {}
    setDark(next);
  };
  return (
    <button type="button" onClick={toggle} className={`btn btn-ghost btn-icon ${className}`} aria-label={dark ? "Passa al tema chiaro" : "Passa al tema scuro"} title={dark ? "Tema chiaro" : "Tema scuro"}>
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
