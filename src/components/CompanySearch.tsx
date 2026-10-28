"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { Company } from "@/lib/companies";

export default function CompanySearch() {
  const router = useRouter();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Company[]>([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const request = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const id = ++request.current;
    const timer = window.setTimeout(async () => {
      const response = await fetch(`/api/companies?q=${encodeURIComponent(q)}`);
      const data = (await response.json()) as { results: Company[] };
      if (id === request.current) {
        setResults(data.results);
        setActive(0);
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [query]);

  const go = (c: Company) => router.push(`/company/${c.code}`);

  return (
    <div className="relative">
      <label className="mb-2 block text-xs font-medium text-zinc-400" htmlFor={`${listId}-input`}>
        銘柄コードか会社名
      </label>
      <input
        id={`${listId}-input`}
        className="w-full rounded-xl border border-zinc-700 bg-zinc-900/80 px-4 py-3.5 text-[17px] text-zinc-50 shadow-[0_0_0_1px_rgba(0,0,0,0.4)] outline-none transition-colors placeholder:text-zinc-600 hover:border-zinc-600 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
        value={query}
        placeholder="例：7203、トヨタ"
        autoComplete="off"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={listId}
        aria-activedescendant={results[active] ? `${listId}-${results[active].code}` : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && results[active]) {
            go(results[active]);
          }
        }}
      />
      {open && query.trim() ? (
        <ul id={listId} role="listbox" className="absolute inset-x-0 top-[calc(100%+6px)] z-20 m-0 max-h-[420px] list-none overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 p-1 shadow-2xl shadow-black/60">
          {results.length === 0 ? (
            <li className="px-3 py-2.5 text-[13px] text-zinc-500">該当する銘柄はありません。コードは4桁で入力してください。</li>
          ) : (
            results.map((c, i) => (
              <li
                key={c.code}
                id={`${listId}-${c.code}`}
                role="option"
                aria-selected={i === active}
                className={`grid cursor-pointer grid-cols-[3.5em_1fr_auto] items-baseline gap-3 rounded-lg px-3 py-2 text-sm sm:grid-cols-[3.5em_1fr_auto_auto] ${i === active ? "bg-zinc-800" : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  go(c);
                }}
                onMouseEnter={() => setActive(i)}
              >
                <span className="font-mono text-xs text-zinc-500">{c.code}</span>
                <span className="truncate font-semibold text-zinc-100">{c.name}</span>
                <span className="hidden text-xs text-zinc-500 sm:inline">{c.sector}</span>
                <span className={`whitespace-nowrap rounded border px-1.5 text-[11px] ${c.covered ? "border-emerald-500/40 text-emerald-300" : "border-zinc-700 text-zinc-500"}`}>{c.covered ? "8期分あり" : "準備中"}</span>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
