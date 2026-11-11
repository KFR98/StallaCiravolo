"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import clsx from "clsx";
import { HorseThumb } from "./ui";

export type HorseOption = {
  /** "c:<coatId>" per un manto, "b:<breedId>" per "tutta la razza" */
  key: string;
  breedId: number;
  coatId: number | null;
  breed: string;
  coat: string | null;
  image: string | null;
  meta?: string;
};

export type BreedLike = { id: number; name: string; coats: { id: number; name: string; image: string | null }[] };

export function buildHorseOptions(breeds: BreedLike[], allowBreedOnly = false): HorseOption[] {
  const out: HorseOption[] = [];
  for (const b of breeds) {
    if (allowBreedOnly) out.push({ key: `b:${b.id}`, breedId: b.id, coatId: null, breed: b.name, coat: null, image: b.coats.find((c) => c.image)?.image ?? null, meta: "tutti i manti" });
    for (const c of b.coats) out.push({ key: `c:${c.id}`, breedId: b.id, coatId: c.id, breed: b.name, coat: c.name, image: c.image });
  }
  return out;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/gray/g, "grey");

/** Filtro in tempo reale: ogni parola digitata deve comparire in razza o manto (in qualsiasi posizione). */
export function matchHorse(o: { breed: string; coat: string | null }, query: string) {
  const q = norm(query).trim();
  if (!q) return true;
  const hay = norm(`${o.breed} ${o.coat ?? ""}`);
  return q.split(/\s+/).every((t) => hay.includes(t));
}

/**
 * Campo unico di ricerca razza + manto con miniature.
 * Scrivendo, l'elenco si restringe subito; frecce/Invio per selezionare.
 * Scrive nei campi nascosti `breedId` e `coatId` (nomi configurabili).
 */
export function HorsePicker({
  options,
  value,
  onChange,
  placeholder = "Cerca razza o manto…",
  breedName = "breedId",
  coatName = "coatId",
  required,
  autoFocus,
  label,
  id,
  clearOnSelect,
}: {
  options: HorseOption[];
  value?: string | null;
  onChange?: (o: HorseOption | null) => void;
  placeholder?: string;
  breedName?: string | null;
  coatName?: string | null;
  required?: boolean;
  autoFocus?: boolean;
  label?: string;
  id?: string;
  /** Svuota il campo dopo la scelta (uso come filtro "aggiungi") */
  clearOnSelect?: boolean;
}) {
  const auto = useId();
  const inputId = id ?? auto;
  const listId = inputId + "-lista";
  const [selKey, setSelKey] = useState<string | null>(value ?? null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => setSelKey(value ?? null), [value]);
  const selected = options.find((o) => o.key === selKey) ?? null;

  const results = useMemo(() => options.filter((o) => matchHorse(o, query)).slice(0, 80), [options, query]);
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    const el = listRef.current?.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const choose = (o: HorseOption | null) => {
    setSelKey(clearOnSelect ? null : o?.key ?? null);
    setQuery("");
    setOpen(false);
    onChange?.(o);
  };

  return (
    <div ref={boxRef} className="relative">
      {label && <label htmlFor={inputId} className="field-label">{label}</label>}
      {breedName && <input type="hidden" name={breedName} value={selected?.breedId ?? ""} />}
      {coatName && <input type="hidden" name={coatName} value={selected?.coatId ?? ""} />}
      <div
        className={clsx("input flex cursor-text items-center gap-2 !py-1.5", open && "!border-accent")}
        onClick={() => {
          setOpen(true);
          inputRef.current?.focus();
        }}
      >
        {selected && !open ? (
          <>
            <HorseThumb src={selected.image} size={28} />
            <span className="min-w-0 flex-1 truncate">
              <b>{selected.breed}</b>
              <span className="text-fg-3"> · {selected.coat ?? selected.meta}</span>
            </span>
          </>
        ) : (
          <Search size={17} className="shrink-0 text-fg-3" aria-hidden="true" />
        )}
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          autoFocus={autoFocus}
          required={required && !selected}
          className={clsx("min-w-0 flex-1 bg-transparent outline-none placeholder:text-fg-3 focus-visible:!outline-none", selected && !open && "absolute h-0 w-0 opacity-0")}
          placeholder={selected ? `${selected.breed} · ${selected.coat ?? selected.meta}` : placeholder}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(results.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter") {
              if (open && results[active]) {
                e.preventDefault();
                choose(results[active]);
              }
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        {selected && (
          <button
            type="button"
            aria-label="Svuota selezione"
            className="shrink-0 rounded p-1 text-fg-3 hover:text-fg"
            onClick={(e) => {
              e.stopPropagation();
              choose(null);
              inputRef.current?.focus();
            }}
          >
            <X size={16} />
          </button>
        )}
      </div>
      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="card absolute inset-x-0 top-full z-50 mt-1 max-h-[300px] overflow-y-auto p-1"
        >
          {results.length === 0 && <li className="px-3 py-3 text-fg-3">Nessun cavallo trovato per “{query}”.</li>}
          {results.map((o, i) => (
            <li
              key={o.key}
              role="option"
              aria-selected={o.key === selKey}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(o);
              }}
              className={clsx(
                "flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5",
                i === active && "bg-surface-3",
                o.key === selKey && "font-semibold",
              )}
            >
              <HorseThumb src={o.image} size={30} />
              <span className="min-w-0 flex-1 truncate">
                {o.breed} <span className="text-fg-3">· {o.coat ?? o.meta}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
