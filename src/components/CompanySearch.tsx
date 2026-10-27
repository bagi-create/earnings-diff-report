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
    <div className="search">
      <label className="search__label" htmlFor={`${listId}-input`}>
        銘柄コードか会社名
      </label>
      <input
        id={`${listId}-input`}
        className="search__input"
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
        <ul id={listId} role="listbox" className="search__list">
          {results.length === 0 ? (
            <li className="search__empty">該当する銘柄はありません。コードは4桁で入力してください。</li>
          ) : (
            results.map((c, i) => (
              <li
                key={c.code}
                id={`${listId}-${c.code}`}
                role="option"
                aria-selected={i === active}
                className={`search__item ${i === active ? "is-active" : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  go(c);
                }}
                onMouseEnter={() => setActive(i)}
              >
                <span className="mono search__code">{c.code}</span>
                <span className="search__name">{c.name}</span>
                <span className="search__meta">{c.sector}</span>
                <span className={`search__badge ${c.covered ? "is-ready" : ""}`}>{c.covered ? "8期分あり" : "準備中"}</span>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
