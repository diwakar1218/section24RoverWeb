"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Check, ChevronRight, Copy, Laptop, Radio, RefreshCw, Search, ShieldCheck, Smartphone, Unplug, Wifi } from "lucide-react";
import { useAuth } from "@/components/providers";
import { useLanguage } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { request } from "@/services/api";
import { notify } from "@/lib/notifications";
import { time, number } from "@/lib/utils";
import { ErrorState, Status } from "./dashboard";
import type { DeviceRegistration } from "@/types";
import { DeviceEnrollment } from "./device-enrollment";
import { MobileDevices } from "./mobile-devices";

export default function Devices() {
  const { profile, demo } = useAuth();
  const { hindi } = useLanguage();
  const allowed = !!profile?.grants.some(g => g.permission === "devices.manage" && g.scope === "Organization");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [selected, setSelected] = useState<string>();
  const [copyState, setCopyState] = useState("");
  const query = useQuery({
    queryKey: ["monitoring", "devices"],
    queryFn: () => request<DeviceRegistration[]>("/devices/registrations"),
    enabled: allowed && !demo,
    refetchInterval: 15000,
  });
  const rows = query.data ?? [];
  const visible = rows.filter(d =>
    `${d.identifier} ${d.model} ${d.receiverSerial ?? ""} ${d.receiverName ?? ""}`.toLowerCase().includes(search.toLowerCase()) &&
    (filter === "All" || (filter === "Attention" ? d.status !== "Approved" || d.connectionStatus !== "Online" || !d.receivingGnss : d.connectionStatus === filter)));
  const current = visible.find(d => d.id === selected) ?? visible[0];
  async function copyId(value: string) {
    try { await navigator.clipboard.writeText(value); setCopyState("Device ID copied"); notify("Device ID copied.","success"); }
    catch { setCopyState("Copy unavailable. Select the device ID to copy it."); notify("Copy unavailable. Select the device ID to copy it.","warning"); }
  }
  if (!allowed) return <ErrorState error={new Error("Organization device administration is required to view registered controllers.")} />;
  return <>
    <div className="page-heading">
      <div><div className="eyebrow"><span className="small-line" /> DEVICE OPERATIONS</div>
        <h1>{hindi ? "डिवाइस और कनेक्शन" : "Your connection to the field"}<span className="heading-dot">.</span></h1>
        <p>{hindi ? "Windows और Android controllers का संपर्क और GNSS data एक जगह देखें।" : "Windows and Android controllers, receiver assignments, and incoming telemetry."}</p>
      </div>
      <Button variant="outline" size="sm" disabled={query.isFetching || demo} onClick={() => void query.refetch()}><RefreshCw size={14} className={query.isFetching ? "spin" : ""} />Refresh devices</Button>
    </div>
    {!demo && <MobileDevices/>}
    {!demo && <DeviceEnrollment current={current} pending={query.isFetching} changed={id => { setSelected(id); setSearch(""); setFilter("All"); void query.refetch(); }} />}
    <section className="device-summary" aria-label="Device summary">
      {[
        { title: "Plugin controllers", value: rows.length, icon: Laptop, note: "Registered plugin installations" },
        { title: "In contact", value: rows.filter(d => d.connectionStatus === "Online").length, icon: Wifi, note: "Recent plugin heartbeat" },
        { title: "Receiving GNSS", value: rows.filter(d => d.receivingGnss).length, icon: Radio, note: "Fresh observations received by API" },
        { title: "Queued events", value: rows.reduce((n, d) => n + d.pendingEventCount, 0), icon: RefreshCw, note: "Last reported by controllers" },
      ].map(m => <article className="kpi-card" key={m.title}><div className="kpi-label">{m.title}<m.icon size={18} /></div><div className="kpi-value">{query.data ? number(m.value) : "—"}</div><div className="kpi-note">{m.note}</div></article>)}
    </section>
    <div className="device-context"><ShieldCheck size={19} /><div><strong>API approval and Trimble licensing are separate.</strong><p>An approved registration permits API uploads. Access, Catalyst Survey, and plugin permissions must also be available on the controller. Their license status is not reported by this API.</p></div></div>
    {query.error && <ErrorState error={query.error} retry={() => void query.refetch()} />}
    {demo && <div className="detail-notice">Device registrations are available when signed in to your API. This preview does not contain registered hardware.</div>}
    <div className="device-workspace">
      <section className="panel device-list-panel" aria-label="Registered devices">
        <div className="panel-heading"><div><h2>{hindi ? "रजिस्टर्ड डिवाइस" : "Registered devices"}<span className="tiny-badge">{rows.length}</span></h2><p>Contact status refreshes every 15 seconds</p></div><span className="device-updated">{query.dataUpdatedAt ? `Updated ${time(new Date(query.dataUpdatedAt).toISOString())} IST` : "Awaiting API"}</span></div>
        <div className="device-toolbar"><label className="device-search"><Search size={16} /><input aria-label="Search devices" placeholder="Search device, model, or receiver…" value={search} onChange={e => setSearch(e.target.value)} /></label><select aria-label="Device contact filter" value={filter} onChange={e => setFilter(e.target.value)}><option>All</option><option>Online</option><option>Stale</option><option>Offline</option><option value="Attention">Needs attention</option></select></div>
        {query.isPending && !demo && !query.error && <div className="empty-state" role="status">Loading registered devices…</div>}
        {!query.isPending && visible.length === 0 && !query.error && <div className="device-empty"><Unplug size={34} /><h3>{rows.length ? "No matching devices" : "No registered controllers yet"}</h3><p>{rows.length ? "Try another search or contact filter." : "Provision a controller through the API setup to see its contact and receiver details here."}</p>{rows.length > 0 && <Button variant="outline" size="sm" onClick={() => { setSearch(""); setFilter("All"); }}>Clear filters</Button>}</div>}
        <div className="device-cards">{visible.map(d => {
          const android = /SAMS|android|SM-/i.test(`${d.identifier} ${d.model}`);
          const Icon = android ? Smartphone : Laptop;
          return <button key={d.id} className={`device-card ${current?.id === d.id ? "selected" : ""}`} onClick={() => { setSelected(d.id); setCopyState(""); }} aria-pressed={current?.id === d.id}>
            <div className="device-card-top"><span className="device-platform-icon"><Icon size={22} /></span><div className="device-card-name"><strong>{d.model}</strong><span>{d.identifier}</span></div><ChevronRight size={17} /></div>
            <div className="device-card-status"><Status value={d.connectionStatus} /><span className={`device-approval ${d.status === "Approved" ? "approved" : ""}`}><ShieldCheck size={13} />API {d.status}</span>{d.isDemo && <span className="tiny-badge">Simulated</span>}</div>
            <div className="device-card-facts"><span><Radio size={14} />{d.receiverSerial ?? "Receiver unassigned"}</span><span><span className={`dot ${d.receivingGnss ? "green" : "amber"}`} />{d.receivingGnss ? "Receiving GNSS" : "No fresh GNSS"}</span></div>
            <div className="device-card-bottom"><span>Last contact</span><strong>{time(d.lastHeartbeat)}</strong></div>
          </button>;
        })}</div>
      </section>
      <aside className="device-inspector">
        <article className="panel">
          <div className="panel-heading"><div><span className="eyebrow">CONNECTION CHECK</span><h2>{current ? current.model : "Select a controller"}</h2></div><Radio size={19} /></div>
          {current ? <div className="device-inspector-body">
            <ol className="connection-checklist">{[
              { ok: current.status === "Approved", title: "API registration", detail: current.status === "Approved" ? "Approved for API authentication" : `Registration ${current.status.toLowerCase()}` },
              { ok: current.connectionStatus === "Online", title: "Plugin contact", detail: current.lastHeartbeat ? `Last heartbeat ${time(current.lastHeartbeat)} IST` : "No heartbeat received" },
              { ok: !!current.receiverId, title: "Receiver assignment", detail: current.receiverSerial ?? "Assign a receiver to this controller" },
              { ok: !!current.jobId, title: "Survey job", detail: current.jobName ?? "No active survey assignment" },
              { ok: current.receivingGnss, title: "GNSS delivery", detail: current.observedAt ? `Last observation ${time(current.observedAt)} IST` : "No observations received from this installation" },
            ].map((s, i) => <li key={s.title} className={s.ok ? "complete" : "waiting"}><span className="check-step">{s.ok ? <Check size={14} /> : i + 1}</span><div><strong>{s.title}</strong><p>{s.detail}</p></div></li>)}</ol>
            <dl className="device-technical"><div><dt>Registered plugin version</dt><dd>{current.pluginVersion}</dd></div><div><dt>Key expires (IST)</dt><dd>{time(current.credentialExpiresAt)}</dd></div><div><dt>Pending events (last report)</dt><dd>{number(current.pendingEventCount)}</dd></div><div><dt>Last synchronization</dt><dd>{time(current.lastSyncAt)}</dd></div></dl>
            <div className="device-id"><span>Controller ID</span><code>{current.identifier}</code><button className="icon-button" aria-label="Copy controller ID" onClick={() => void copyId(current.identifier)}><Copy size={15} /></button></div>
            <p role="status" className="device-copy-status">{copyState}</p>
            {current.receiverId && profile?.grants.some(g => g.permission === "rovers.read") && <Link className="text-link" href={`/dashboard/rovers/${current.receiverId}`}>Open receiver details<ArrowUpRight size={14} /></Link>}
          </div> : <div className="empty-state">Choose a registered device to inspect its data connection.</div>}
        </article>
        <article className="device-help"><span className="eyebrow">FROM RECEIVER TO DASHBOARD</span><h3>Bring your controller online.</h3><p>Open Survey Command in Trimble Access, then choose <strong>Configure live upload</strong>. Use your HTTPS API address, device key, and assigned receiver and job IDs.</p><p>Open the matching Access job and connect the DA2. Once fresh positions arrive, GNSS delivery updates here.</p><Link href="/dashboard/surveys" className="text-link">View survey jobs<ArrowUpRight size={14} /></Link></article>
      </aside>
    </div>
  </>;
}
