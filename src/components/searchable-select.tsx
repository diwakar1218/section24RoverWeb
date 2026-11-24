"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
export type SelectOption = { code: string; name: string; englishName?: string };
export function SearchableSelect({ label, value, options, onChange, disabled, loading, error, retry, allLabel = "All", allowAll = true }: {
  label: string; value: string; options: SelectOption[]; onChange: (option: SelectOption | null) => void;
  disabled?: boolean; loading?: boolean; error?: boolean; retry?: () => void; allLabel?: string; allowAll?: boolean;
}) {
  const [open, setOpen] = useState(false), [search, setSearch] = useState("");
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), id = useId();
  useEffect(() => {
    const close = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close); return () => document.removeEventListener("pointerdown", close);
  }, []);
  const selected = options.find(o => o.code === value);
  const filtered = options.filter(o => `${o.name} ${o.englishName ?? ""} ${o.code}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
    .sort((a, b) => (a.englishName || a.name).localeCompare(b.englishName || b.name, "en", { numeric: true }));
  function select(option: SelectOption | null) { onChange(option); setOpen(false); setSearch(""); trigger.current?.focus(); }
  return <div className="report-select" ref={root} onKeyDown={e => { if (e.key === "Escape") { setOpen(false); trigger.current?.focus(); } }}>
    <label id={id + "-label"}>{label}</label>
    <button type="button" ref={trigger} className="report-select-trigger" aria-labelledby={id + "-label"} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? id : undefined} disabled={disabled || loading} onClick={() => { setSearch(""); setOpen(!open); }}>
      <span>{loading ? "Loading…" : selected?.name || (value ? value : allLabel)}</span><ChevronDown size={15}/>
    </button>
    {error && <button type="button" className="report-field-error" onClick={retry}>Unable to load. Retry</button>}
    {open && <div className="report-select-popover">
      <div className="report-select-search"><Search size={15}/><input autoFocus aria-label={`Search ${label}`} value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${label.toLowerCase()}…`} onKeyDown={e => { if (e.key === "ArrowDown") { e.preventDefault(); root.current?.querySelector<HTMLButtonElement>('[role="option"]')?.focus(); } }}/></div>
      <div id={id} role="listbox" aria-labelledby={id + "-label"} className="report-select-options" onKeyDown={e => {
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        e.preventDefault(); const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]'));
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[(index + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
      }}>
        {allowAll && <button type="button" role="option" aria-selected={!value} onClick={() => select(null)}>{allLabel}{!value && <Check size={14}/>}</button>}
        {filtered.map(o => <button type="button" role="option" aria-selected={o.code === value} key={o.code} onClick={() => select(o)}><span>{o.name}{o.englishName && o.englishName !== o.name && <small>{o.englishName}</small>}</span>{o.code === value && <Check size={14}/>}</button>)}
        {!filtered.length && <p className="empty-state">No matching options.</p>}
      </div>
    </div>}
  </div>;
}
