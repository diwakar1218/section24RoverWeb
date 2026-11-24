"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowUpDown, CalendarDays, ChevronLeft, ChevronRight, ClipboardCheck, FileChartColumn, MapPinned, Printer, Radio, RotateCcw, Search, Target, Users } from "lucide-react";
import { useAuth } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { SearchableSelect, type SelectOption } from "@/components/searchable-select";
import { API, accessToken, refresh, request } from "@/services/api";
import { ErrorState } from "@/features/dashboard";
import { notify, errorMessage } from "@/lib/notifications";

type Filters = { from: string; to: string; district: SelectOption | null; tehsil: SelectOption | null; village: SelectOption | null; userId: string; rover: string; groupBy: string; search: string };
type Totals = { surveys: number; completed: number; points: number; trackPositions: number; areaM2: number; distanceM: number; users: number; rovers: number };
type Row = { day: string; district: string; tehsil: string; village: string; userId: string | null; userName: string; loginName: string; rover: string; surveys: number; completed: number; points: number; trackPositions: number; areaM2: number; distanceM: number };
type Report = { from: string; to: string; timeZone: string; groupBy: string; totals: Totals; users: SelectOption[]; rovers: SelectOption[]; rows: Row[]; totalRows: number; page: number; pageSize: number };
const groups = [{ code: "detail", name: "Daily detailed report" }, { code: "rover", name: "Rover wise" }, { code: "district", name: "District wise" }, { code: "tehsil", name: "Tehsil wise" }, { code: "village", name: "Village wise" }, { code: "user", name: "User wise" }];
const n = (value: number, decimals = 0) => value.toLocaleString("en-IN", { maximumFractionDigits: decimals });
const displayRover = (r: string) => r === "__multiple__" ? "Multiple rovers (session total)" : r || "Not recorded";
function initial(): Filters {
  const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  return { from: new Date(Date.parse(today + "T00:00:00Z") - 6 * 86400000).toISOString().slice(0, 10), to: today, district: null, tehsil: null, village: null, userId: "", rover: "", groupBy: "detail", search: "" };
}
function params(f: Filters, sort: string, direction: string) {
  const p = new URLSearchParams({ from: f.from, to: f.to, groupBy: f.groupBy, userId: f.userId, rover: f.rover, search: f.search, sort, direction });
  for (const level of ["district", "tehsil", "village"] as const) if (f[level]) {
    p.set(level + "Code", f[level].code); p.set(level, f[level].name); p.set(level + "English", f[level].englishName ?? "");
  }
  return p;
}
const rules = "Dates use Indian Standard Time (IST). Points and track positions count on capture day. Completed surveys, area and distance count once on completion day. Surveys worked is a distinct survey count; row counts can overlap across days or rovers. Unverified legacy imports are excluded.";
function ReportTable({ rows, group, sort, direction, onSort }: { rows: Row[]; group: string; sort?: string; direction?: string; onSort?: (key: string) => void }) {
  const columns = [
    { key: "day", label: "Date (IST)", show: true },
    { key: "district", label: "District", show: ["detail", "district", "tehsil", "village"].includes(group) },
    { key: "tehsil", label: "Tehsil", show: ["detail", "tehsil", "village"].includes(group) },
    { key: "village", label: "Village", show: ["detail", "village"].includes(group) },
    { key: "userName", label: "User", show: ["detail", "user"].includes(group) },
    { key: "rover", label: "Rover serial", show: ["detail", "rover"].includes(group) },
    { key: "surveys", label: "Surveys worked", show: true }, { key: "completed", label: "Completed", show: true },
    { key: "points", label: "Points", show: true }, { key: "trackPositions", label: "Track positions", show: true },
    { key: "areaM2", label: "Area (sq m)", show: true }, { key: "areaHa", label: "Area (ha)", show: true }, { key: "distanceM", label: "Distance (m)", show: true },
  ].filter(c => c.show);
  return <div className="table-overflow report-table"><table><thead><tr>{columns.map(c => <th key={c.key}>{onSort && !["trackPositions", "areaHa"].includes(c.key) ? <button type="button" onClick={() => onSort(c.key)}>{c.label}<ArrowUpDown size={12}/>{sort === c.key && <span className="sr-only">{direction === "asc" ? "Ascending" : "Descending"}</span>}</button> : c.label}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={`${r.day}-${i}`}>{columns.map(c => <td key={c.key} className={["surveys", "completed", "points", "trackPositions", "areaM2", "areaHa", "distanceM"].includes(c.key) ? "report-number" : ""}>
      {c.key === "rover" ? <span className="report-rover"><Radio size={13}/>{displayRover(r.rover)}</span>
        : c.key === "userName" ? <>{r.userName}<small>{r.loginName}</small></>
        : c.key === "areaHa" ? n(r.areaM2 / 10000, 4)
        : typeof r[c.key as keyof Row] === "number" ? n(r[c.key as keyof Row] as number, ["areaM2", "distanceM"].includes(c.key) ? 2 : 0)
        : String(r[c.key as keyof Row] || "—")}</td>)}</tr>)}</tbody></table></div>;
}
export default function Reports() {
  const { profile, demo } = useAuth();
  const permitted = !!profile?.grants.some(g => g.permission === "reports.read");
  const [draft, setDraft] = useState<Filters>(initial), [applied, setApplied] = useState<Filters>(initial);
  const [page, setPage] = useState(1), [pageSize, setPageSize] = useState(25), [sort, setSort] = useState("day"), [direction, setDirection] = useState("desc");
  const [actionError, setActionError] = useState(""), [busy, setBusy] = useState(""), [printRows, setPrintRows] = useState<Row[] | null>(null);
  const districts = useQuery({ queryKey: ["report-land", "district"], queryFn: () => request<SelectOption[]>("/mobile/land-records/district"), enabled: permitted && !demo, staleTime: 3600000 });
  const tehsils = useQuery({ queryKey: ["report-land", "tehsil", draft.district?.code], queryFn: () => request<SelectOption[]>(`/mobile/land-records/tehsil?dcc=${draft.district?.code}`), enabled: permitted && !demo && !!draft.district, staleTime: 3600000 });
  const villages = useQuery({ queryKey: ["report-land", "village", draft.district?.code, draft.tehsil?.code], queryFn: () => request<SelectOption[]>(`/mobile/land-records/village?dcc=${draft.district?.code}&tcc=${draft.tehsil?.code}`), enabled: permitted && !demo && !!draft.district && !!draft.tehsil, staleTime: 3600000 });
  const queryParams = params(applied, sort, direction);
  const report = useQuery({ queryKey: ["daily-work", queryParams.toString(), page, pageSize], queryFn: () => request<Report>(`/reports/daily-work?${queryParams}&page=${page}&pageSize=${pageSize}`), enabled: permitted && !demo });
  const data = report.data, changed = JSON.stringify(draft) !== JSON.stringify(applied);
  const dateError = !draft.from || !draft.to || draft.to < draft.from || (Date.parse(draft.to) - Date.parse(draft.from)) / 86400000 > 365;
  function update(patch: Partial<Filters>) { setDraft(f => ({ ...f, ...patch })); }
  function generate() { if (dateError) return; setPage(1); setPrintRows(null); setActionError(""); setApplied({ ...draft }); if (!changed && page === 1) void report.refetch(); }
  async function download() {
    setBusy("export"); setActionError("");
    try {
      const url = `${API}/api/v1/reports/daily-work/export?${queryParams}`;
      let response = await fetch(url, { credentials: "include", headers: { Authorization: `Bearer ${await accessToken()}` } });
      if (response.status === 401) { const token = await refresh(); if (token) response = await fetch(url, { credentials: "include", headers: { Authorization: `Bearer ${token}` } }); }
      if (!response.ok) throw new Error("Export could not be generated. Check your connection and report permissions, then try again.");
      const urlBlob = URL.createObjectURL(await response.blob()); const a = document.createElement("a"); a.href = urlBlob; a.download = `daily-work-${applied.from}-${applied.to}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(urlBlob), 1000);
      notify("Report export is ready.","success");
    } catch (error) { setActionError(errorMessage(error)); notify(errorMessage(error)); }
    finally { setBusy(""); }
  }
  async function print() {
    if (!data) return;
    if (data.totalRows > 2000) { const message="For PDF/print, narrow the report to 2,000 rows or fewer. CSV exports all matching rows.";setActionError(message);notify(message,"warning");return; }
    setBusy("print"); setActionError("");
    try {
      const rows: Row[] = [];
      for (let p = 1; p <= Math.ceil(data.totalRows / 200); p++) {
        const result = await request<Report>(`/reports/daily-work?${queryParams}&page=${p}&pageSize=200`); rows.push(...result.rows);
      }
      setPrintRows(rows); await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); window.print();
    } catch { setActionError("Print report could not be loaded. Try again."); notify("Print report could not be loaded. Try again."); }
    finally { setBusy(""); }
  }
  if (!permitted) return <ErrorState error={new Error("Report access is not assigned to your account.")}/>;
  if (demo) return <div className="panel p-5">Sign in to the API to generate daily field work reports.</div>;
  const cards = data ? [
    { label: "Surveys worked", value: n(data.totals.surveys), note: `${n(data.totals.completed)} completed`, icon: ClipboardCheck },
    { label: "Measured points", value: n(data.totals.points), note: `${n(data.totals.trackPositions)} track positions`, icon: Target },
    { label: "Completed area", value: `${n(data.totals.areaM2, 2)} m²`, note: `${n(data.totals.areaM2 / 10000, 4)} hectares`, icon: MapPinned },
    { label: "Distance", value: `${n(data.totals.distanceM, 2)} m`, note: `${n(data.totals.users)} users · ${n(data.totals.rovers)} recorded rovers`, icon: Radio },
  ] : [];
  const title = groups.find(g => g.code === applied.groupBy)?.name ?? "Daily report";
  return <div className="reports-workspace"><div className="report-screen">
    <div className="page-heading"><div><span className="eyebrow">FIELD PERFORMANCE</span><h1>Daily work reports<span className="heading-dot">.</span></h1><p>Track survey output by rover, location and user. Every day, in one place.</p></div><span className="report-timezone"><CalendarDays size={15}/>Indian Standard Time</span></div>
    <section className="panel report-filters"><div className="panel-heading"><div><h2><FileChartColumn size={18}/>Build your report</h2><p>Choose a period, location and reporting view</p></div><span className="tiny-badge">Bhulekh locations</span></div>
      <form onSubmit={e => { e.preventDefault(); generate(); }}><div className="report-filter-grid">
        <label className="report-field">From date<input type="date" required min="1900-01-01" max={draft.to || undefined} value={draft.from} onChange={e => update({ from: e.target.value })}/></label>
        <label className="report-field">To date<input type="date" required min={draft.from || "1900-01-01"} value={draft.to} onChange={e => update({ to: e.target.value })}/></label>
        <SearchableSelect label="Report view" value={draft.groupBy} options={groups} allowAll={false} onChange={o => update({ groupBy: o?.code ?? "detail" })} allLabel="Daily detailed report"/>
        <SearchableSelect label="District" value={draft.district?.code ?? ""} options={districts.data ?? []} loading={districts.isFetching && !districts.data} error={!!districts.error} retry={() => void districts.refetch()} onChange={o => update({ district: o, tehsil: null, village: null, userId: "", rover: "" })} allLabel="All districts"/>
        <SearchableSelect label="Tehsil" value={draft.tehsil?.code ?? ""} options={tehsils.data ?? []} disabled={!draft.district} loading={tehsils.isFetching && !tehsils.data} error={!!tehsils.error} retry={() => void tehsils.refetch()} onChange={o => update({ tehsil: o, village: null, userId: "", rover: "" })} allLabel={draft.district ? "All tehsils" : "Select district first"}/>
        <SearchableSelect label="Village" value={draft.village?.code ?? ""} options={villages.data ?? []} disabled={!draft.tehsil} loading={villages.isFetching && !villages.data} error={!!villages.error} retry={() => void villages.refetch()} onChange={o => update({ village: o, userId: "", rover: "" })} allLabel={draft.tehsil ? "All villages" : "Select tehsil first"}/>
        <SearchableSelect label="User" value={draft.userId} options={data?.users ?? []} onChange={o => update({ userId: o?.code ?? "", rover: "" })} allLabel="All users with work"/>
        <SearchableSelect label="Rover" value={draft.rover} options={data?.rovers ?? []} onChange={o => update({ rover: o?.code ?? "" })} allLabel="All rovers"/>
        <label className="report-field">Search report<span className="report-search"><Search size={15}/><input type="search" value={draft.search} onChange={e => update({ search: e.target.value })} placeholder="Location, user, rover…" maxLength={200}/></span></label>
      </div><div className="report-filter-actions"><div><button type="button" className="text-button" onClick={() => update({ ...initial() })}><RotateCcw size={14}/>Reset filters</button>{changed && <span className="report-pending">Filters changed · generate to apply</span>}</div><Button type="submit" disabled={dateError || report.isFetching}><FileChartColumn size={15}/>{report.isFetching ? "Generating…" : "Generate report"}</Button></div>
      {dateError && <p role="alert" className="report-field-error">Choose valid dates within a 366-day period.</p>}</form>
    </section>
    {report.error && <ErrorState error={new Error(`${report.error.message} If the hosted API has an older build, update its api folder using the latest publish ZIP to enable daily reporting.`)} retry={() => void report.refetch()}/>}
    {actionError && <div className="error-box" role="alert">{actionError}</div>}
    {report.isPending && <div className="empty-state" role="status">Loading work report…</div>}
    {!!data && <>
      <section className="kpi-grid report-summary" aria-label="Report totals">{cards.map(c => <article className="kpi-card" key={c.label}><div className="kpi-label"><span>{c.label}</span><span className="kpi-icon"><c.icon size={21}/></span></div><div className="kpi-value">{c.value}</div><div className="kpi-note">{c.note}</div></article>)}</section>
      <section className="panel report-results"><div className="panel-heading"><div><h2>{title}</h2><p>{data.from} — {data.to} · IST · {n(data.totalRows)} rows</p></div><div className="report-export-actions"><Button variant="outline" size="sm" onClick={print} disabled={!!busy || changed || report.isFetching || !data.totalRows}><Printer size={14}/>{busy === "print" ? "Preparing…" : "Print / PDF"}</Button><Button size="sm" onClick={download} disabled={!!busy || changed || report.isFetching || !data.totalRows}><ArrowDownToLine size={14}/>{busy === "export" ? "Exporting…" : "Export all · CSV / Excel"}</Button></div></div>
        <ReportTable rows={data.rows} group={applied.groupBy} sort={sort} direction={direction} onSort={key => { setPage(1); setSort(key); setDirection(sort === key && direction === "desc" ? "asc" : "desc"); }}/>
        {!data.rows.length && <div className="empty-state"><FileChartColumn size={28}/><h3>No work found for this selection</h3><p>Try a different date range or clear the location/user filters. Only synced, authorized Android surveys are included.</p></div>}
        <div className="table-footer report-pagination"><span>{data.totalRows ? `${n((page - 1) * pageSize + 1)}–${n(Math.min(page * pageSize, data.totalRows))} of ${n(data.totalRows)}` : "0 rows"} · Export includes all matching rows</span><div><label>Rows <select aria-label="Rows per page" value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>{[25, 50, 100, 200].map(s => <option key={s}>{s}</option>)}</select></label><Button variant="outline" size="sm" aria-label="Previous page" disabled={page <= 1 || report.isFetching} onClick={() => setPage(p => p - 1)}><ChevronLeft size={14}/></Button><Button variant="outline" size="sm" aria-label="Next page" disabled={page * pageSize >= data.totalRows || report.isFetching} onClick={() => setPage(p => p + 1)}><ChevronRight size={14}/></Button></div></div>
      </section><div className="report-method"><Users size={18}/><div><strong>How work is counted</strong><p>{rules} Multiple-rover surveys keep final totals in a separate “Multiple rovers” row. CSV opens in Excel with Hindi text preserved.</p></div></div>
    </>}
  </div>{data && <div className="report-print"><h1>{title}</h1><p>{applied.from} — {applied.to} · Asia/Kolkata (IST)</p><p>{[applied.district?.name, applied.tehsil?.name, applied.village?.name, data.users.find(u => u.code === applied.userId)?.name, data.rovers.find(r => r.code === applied.rover)?.name, applied.search && `Search: ${applied.search}`].filter(Boolean).join(" · ") || "All authorized work"}</p><p>{n(data.totals.surveys)} surveys · {n(data.totals.completed)} completed · {n(data.totals.points)} points · {n(data.totals.areaM2, 2)} sq m · {n(data.totals.distanceM, 2)} m</p><ReportTable rows={printRows ?? data.rows} group={applied.groupBy}/><p>{rules}</p></div>}</div>;
}
