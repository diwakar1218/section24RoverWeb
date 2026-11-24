"use client";
import { useState, useEffect } from "react";
import { notify, errorMessage } from "@/lib/notifications";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Radio,
  Users,
  ClipboardCheck,
  MapPinned,
  ArrowUpRight,
  RefreshCw,
  Activity,
  Layers,
  ChevronRight,
  Signal,
  Target,
  CalendarDays,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { useAuth } from "@/components/providers";
import { useLanguage } from "@/components/shell";
import { Button } from "@/components/ui/button";
import {
  useRovers,
  useSummary,
  useDistricts,
  useLive,
} from "@/hooks/use-monitoring";
import { number, time } from "@/lib/utils";
import type { Summary, RoverView } from "@/types";
import { SearchableSelect, type SelectOption } from "@/components/searchable-select";
import { useLandRecords, mergeLandOptions } from "@/hooks/use-land-records";
import { districtKey } from "@/services/mobile-monitoring";
import { DashboardRecords } from "./dashboard-records";
import { RoverHours } from "./rover-hours";
const RoverMap = dynamic(() => import("@/components/rover-map"), {
  ssr: false,
  loading: () => <div className="map-skeleton">Loading GIS workspace…</div>,
});
export function ErrorState({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  const message = errorMessage(error);
  useEffect(() => { notify(message); }, [message]);
  return (
    <div role="alert" className="error-box">
      <strong>Unable to load this view</strong>
      <p>
        {error instanceof Error
          ? error.message
          : "Please check your connection."}
      </p>
      {retry && (
        <Button variant="outline" size="sm" onClick={retry}>
          Try again
        </Button>
      )}
    </div>
  );
}
export function Status({ value }: { value: string }) {
  return (
    <span className={`badge ${value.toLowerCase()}`}>
      <span className="dot" />
      {value.replace(/([a-z])([A-Z])/g, "$1 $2")}
    </span>
  );
}
export function RoverList({
  rovers,
  onFocus,
}: {
  rovers: RoverView[];
  onFocus?: (id: string) => void;
}) {
  return (
    <div className="rover-rows">
      {rovers.length === 0 && (
        <div className="empty-state">No rovers in this jurisdiction.</div>
      )}
      {rovers.map((r) => (
        <div key={r.data.id} className="rover-row">
          <span className={`rover-icon ${r.connectionStatus.toLowerCase()}`}>
            <Radio size={18} />
          </span>
          <div className="rover-row-main">
            <Link href={`/dashboard/rovers/${r.data.id}`}>
              {r.data.name}
              <ArrowUpRight size={12} />
            </Link>
            {r.data.latitude != null && r.data.longitude != null && <small className="rover-coordinate-line">{r.data.latitude.toFixed(8)}, {r.data.longitude.toFixed(8)}</small>}
            <Link
              href={`/dashboard/users/${r.data.surveyorId}`}
              className="surveyor-link"
            >
              {r.data.surveyorName ?? "Unassigned"}
            </Link>
          </div>
          <div className="rover-row-end">
            <Status value={r.connectionStatus} />
            <button
              onClick={() => onFocus?.(r.data.id)}
              disabled={!onFocus}
              className="text-button"
            >
              {r.data.district} {onFocus && <ChevronRight size={11} />}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
export default function Dashboard({ mapOnly = false }: { mapOnly?: boolean }) {
  const { demo, profile } = useAuth(),
    { hindi } = useLanguage(),
    [district, setDistrict] = useState(""),
    [focus, setFocus] = useState<string>();
  const [selectedMetric,setSelectedMetric]=useState<string|null>(null),[districtChoice,setDistrictChoice]=useState<SelectOption|null>(null);
  const landDistricts=useLandRecords("district","","",!demo&&!!profile);
  const rovers = useRovers(district),
    summary = useSummary(district),
    districts = useDistricts(),
    live = useLive();
  const rows = rovers.data ?? [],
    s = summary.data;
  const metrics: {
    key: Exclude<keyof Summary,"telemetryAvailable">;
    label: string;
    hi: string;
    icon: typeof Radio;
    note: string;
    unit?: string;
  }[] = [
    {
      key: "rovers",
      label: "Rover connections",
      hi: "पंजीकृत रोवर",
      icon: Radio,
      note: "Android app and registered receivers",
    },
    {
      key: "online",
      label: "Online rovers",
      hi: "ऑनलाइन रोवर",
      icon: Signal,
      note: "Recent controller heartbeat",
    },
    {
      key: "workingSurveyors",
      label: "Surveyors working",
      hi: "कार्यरत सर्वेक्षक",
      icon: Users,
      note: "Active survey sessions",
    },
    {
      key: "activeJobs",
      label: "Active survey jobs",
      hi: "सक्रिय सर्वेक्षण",
      icon: ClipboardCheck,
      note: "Currently in progress",
    },
    {
      key: "points",
      label: "Survey points",
      hi: "सर्वेक्षण बिंदु",
      icon: Target,
      note: "Recorded measurements",
    },
    {
      key: "areaM2",
      label: "Surveyed area",
      hi: "सर्वेक्षित क्षेत्र",
      icon: MapPinned,
      note: "Saved survey boundaries",
      unit: "sq m",
    },
    {
      key: "stale",
      label: "Stale rovers",
      hi: "पुराना संपर्क",
      icon: Activity,
      note: "Heartbeat exceeds online threshold",
    },
    {
      key: "offline",
      label: "Offline rovers",
      hi: "ऑफलाइन रोवर",
      icon: Radio,
      note: "No recent controller contact",
    },
  ];
  function refreshAll() {
    void rovers.refetch();
    void summary.refetch();
    void districts.refetch();
  }
  const fixed = rows.filter((r) => r.data.fixType === "RtkFixed").length;
  const chart = (districts.data ?? []).filter(
    (d) => !district || d.districtId === district,
  );
  return (
    <>
      {!demo && rows.some((r) => r.data.isDemo) && (
        <div className="detail-notice" role="status">
          <strong>SIMULATED TELEMETRY</strong> · This API snapshot includes development devices and synthetic GNSS positions.
        </div>
      )}
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="small-line" />{" "}
            {hindi ? "सर्वेक्षण संचालन" : "OPERATIONS OVERVIEW"}
          </div>
          <h1>
            {mapOnly
              ? hindi
                ? "लाइव ट्रैकिंग"
                : "Live rover tracking"
              : hindi
                ? "आपके क्षेत्र का स्पष्ट दृश्य।"
                : "Your field. In focus"}
            <span className="heading-dot">.</span>
          </h1>
          <p>
            {mapOnly
              ? "Authorized receiver locations, fix quality, and last known positions."
              : hindi
                ? "सभी अधिकृत क्षेत्रों में टीम, उपकरण और सर्वेक्षण प्रगति की निगरानी करें।"
                : "Monitor your teams, equipment, and survey progress across every jurisdiction."}
          </p>
        </div>
        <div className="heading-actions">
          <span className="date-label">
            <CalendarDays size={15} />
            {new Date().toLocaleDateString("en-IN", {
              timeZone: "Asia/Kolkata",
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
          <Button variant="outline" size="sm" onClick={refreshAll}>
            <RefreshCw size={14} className={rovers.isFetching ? "spin" : ""} />
            Refresh
          </Button>
        </div>
      </div>
      <div className="filter-bar">
        <div className="filter-items">
          <span className="filter-label">
            <Layers size={15} />
            {hindi ? "कार्यक्षेत्र" : "Jurisdiction"}
          </span>
          <div className="dashboard-location-filter"><SearchableSelect label="District" value={districtChoice?.code??""} allLabel="All authorized districts" options={mergeLandOptions(landDistricts.data,(districts.data??[]).map(d=>({code:"internal:"+d.districtId,name:d.name})))} loading={!demo&&landDistricts.isPending} error={landDistricts.isError} retry={()=>void landDistricts.refetch()} onChange={async option=>{setDistrictChoice(option);setSelectedMetric(null);if(!option){setDistrict("");return;}const known=districts.data?.find(d=>d.name===option.name||d.name===option.englishName);setDistrict(option.code.startsWith("internal:")?option.code.slice(9):known?.districtId??await districtKey(option.code));}}/></div>
          <span className="scope-note">
            {demo ? "Madhya Pradesh · Demo" : "Your assigned organization"}
          </span>
        </div>
        <span className="feed-status">
          <span
            className={`dot ${live === "Live updates" || demo ? "green" : "amber"}`}
          />
          {live}
        </span>
      </div>
      {(rovers.error || summary.error) && (
        <ErrorState error={rovers.error ?? summary.error} retry={refreshAll} />
      )}
      {s?.telemetryAvailable===false&&<div className="detail-notice" role="status">Saved Android surveys and last captured coordinates are available. Live rover status requires the updated hosted API.</div>}
      {!mapOnly&&<RoverHours district={district} open={selectedMetric==="roverHours"} select={()=>setSelectedMetric("roverHours")} close={()=>setSelectedMetric(null)}/>}
      {!mapOnly && (
        <section className="kpi-grid" aria-label="Dashboard metrics">
          {metrics.map((m, index) => {
            const Icon = m.icon,
              value = s?.[m.key];
            return (
              <button type="button" className={`kpi-card metric-card kpi-${m.key} ${selectedMetric===m.key?"selected":""}`} key={m.key} aria-label={`Show details: ${m.label}`} aria-expanded={selectedMetric===m.key} aria-controls="metric-records" onClick={()=>setSelectedMetric(m.key)}>
                <div className="kpi-label">
                  <span>{hindi ? m.hi : m.label}</span>
                  <span className="kpi-icon" aria-hidden="true"><Icon size={22} strokeWidth={1.8} /></span>
                </div>
                <div className={`kpi-value ${index === 1 ? "text-green" : ""}`}>
                  {value == null ? "—" : s?.telemetryAvailable===false&&["online","offline","stale","workingSurveyors"].includes(m.key)?<small className="metric-unavailable">Unavailable</small>:m.unit ? value.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : number(value)}
                  {m.unit && <small>{m.unit}</small>}
                </div>
                <div className="kpi-note">
                  <span className="kpi-note-dot" aria-hidden="true" />
                  {m.unit && s ? `${(s.areaM2 / 10000).toFixed(4)} ha · ${m.note}` : m.note}
                </div>
                <span className="metric-details-hint">View detailed records <ArrowUpRight size={13}/></span>
              </button>
            );
          })}
        </section>
      )}
      {selectedMetric&&selectedMetric!=="roverHours"&&!mapOnly&&<DashboardRecords metric={selectedMetric} title={metrics.find(m=>m.key===selectedMetric)?.label??"Records"} rovers={rows} district={district} telemetryAvailable={s?.telemetryAvailable!==false} close={()=>setSelectedMetric(null)}/>}
      <section className={`map-and-team ${mapOnly ? "expanded-map" : ""}`}>
        <article className="panel map-panel">
          <div className="panel-heading">
            <div>
              <h2>
                <MapPinned size={17} />
                {hindi ? "लाइव संचालन मानचित्र" : "Live operations map"}
                <span className="tiny-badge">
                  {rows.filter((r) => r.data.latitude !== null).length}{" "}
                  locations
                </span>
              </h2>
              <p>Receiver positions · WGS 84</p>
            </div>
            {!mapOnly && (
              <Link className="text-link" href="/dashboard/live-tracking">
                Expand map
                <ArrowUpRight size={14} />
              </Link>
            )}
          </div>
          <RoverMap rovers={rows} focusedId={focus} />
        </article>
        <article className="panel field-team">
          <div className="panel-heading">
            <div>
              <h2>
                {hindi ? "मैदान में टीम" : "In the field"}
                <span className="tiny-badge">{rows.length}</span>
              </h2>
              <p>Rovers & assigned surveyors</p>
            </div>
            <Link aria-label="View all rovers" href="/dashboard/rovers">
              <ArrowUpRight size={17} />
            </Link>
          </div>
          <RoverList rovers={rows} onFocus={setFocus} />
          <Link className="panel-footer-link" href="/dashboard/rovers">
            View all rovers
            <ChevronRight size={14} />
          </Link>
        </article>
      </section>
      {!mapOnly && (
        <>
          <section className="bottom-grid">
            <article className="panel district-panel">
              <div className="panel-heading">
                <div>
                  <h2>District survey progress</h2>
                  <p>Completed jobs against total assigned work</p>
                </div>
                <span className="tiny-badge">{chart.length} districts</span>
              </div>
              <div className="district-list">
                {chart.length === 0 && (
                  <div className="empty-state">
                    No authorized survey jobs yet.
                  </div>
                )}
                {chart.map((d) => (
                  <button
                    className="district-row"
                    key={d.districtId}
                    onClick={() => setDistrict(d.districtId)}
                  >
                    <div>
                      <strong>
                        {d.name}
                        <ChevronRight size={12} />
                      </strong>
                      <span>
                        {d.active} active · {d.total} total jobs
                      </span>
                    </div>
                    <div className="progress">
                      <span
                        style={{
                          width: `${d.total ? (d.completed / d.total) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <b>
                      {d.total ? Math.round((d.completed / d.total) * 100) : 0}%
                    </b>
                  </button>
                ))}
              </div>
            </article>
            <article className="panel connectivity-panel">
              <div className="panel-heading">
                <div>
                  <h2>Device connectivity</h2>
                  <p>Controller contact, independent of GNSS fix</p>
                </div>
                <Radio size={17} />
              </div>
              <div className="connectivity-total">
                <strong>{s ? number(s.rovers) : "—"}</strong>
                <span>registered rovers</span>
              </div>
              <div className="connectivity-bar">
                {(["online", "stale", "offline"] as const).map((key) => (
                  <span
                    key={key}
                    className={key}
                    style={{
                      width: `${s?.rovers ? (s[key] / s.rovers) * 100 : 0}%`,
                    }}
                  />
                ))}
              </div>
              <div className="connection-stats">
                {(["online", "stale", "offline"] as const).map((key) => (
                  <div key={key}>
                    <span>
                      <i
                        className={`dot ${key === "online" ? "green" : key === "stale" ? "amber" : "gray"}`}
                      />
                      {key}
                    </span>
                    <strong>{s?.[key] ?? "—"}</strong>
                  </div>
                ))}
              </div>
              <div className="precision-note">
                <Target size={15} />
                <span>
                  <strong>
                    {fixed} / {rows.length}
                  </strong>{" "}
                  receivers report RTK Fixed
                </span>
              </div>
            </article>
            <article className="panel activity-panel">
              <div className="panel-heading">
                <div>
                  <h2>Work by district</h2>
                  <p>Current active survey jobs</p>
                </div>
                <span className="chart-key">
                  <i className="dot green" />
                  Active
                </span>
              </div>
              <div className="chart-container">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chart}
                    margin={{ top: 15, right: 10, left: -25, bottom: 0 }}
                  >
                    <CartesianGrid
                      vertical={false}
                      strokeDasharray="3 4"
                      stroke="var(--line)"
                    />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: "var(--muted)" }}
                    />
                    <YAxis
                      allowDecimals={false}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: "var(--muted)" }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--surface)",
                        border: "1px solid var(--line)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Bar
                      dataKey="active"
                      fill="#208771"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={28}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>
          </section>
          <section className="bottom-grid secondary-grid">
            <article className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Recent position observations</h2>
                  <p>Observation time, separate from server receipt</p>
                </div>
                <Activity size={17} />
              </div>
              <div className="event-list">
                {[...rows]
                  .filter((r) => r.data.observedAt)
                  .sort(
                    (a, b) =>
                      Date.parse(b.data.observedAt!) -
                      Date.parse(a.data.observedAt!),
                  )
                  .slice(0, 4)
                  .map((r) => (
                    <Link
                      key={r.data.id}
                      href={`/dashboard/rovers/${r.data.id}`}
                    >
                      <span className="event-dot" />
                      <div>
                        <strong>
                          {r.data.name}
                          <span> · {r.data.fixType}</span>
                        </strong>
                        <small>
                          {r.data.district} · {r.data.surveyorName}
                        </small>
                      </div>
                      <time>{time(r.data.observedAt)}</time>
                    </Link>
                  ))}
                {rows.every((r) => !r.data.observedAt) && (
                  <div className="empty-state">No positions received.</div>
                )}
              </div>
            </article>
            <article className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Needs attention</h2>
                  <p>Stale and offline controller connections</p>
                </div>
                <span className="tiny-badge">
                  {rows.filter((r) => r.connectionStatus !== "Online").length}
                </span>
              </div>
              <RoverList
                rovers={rows
                  .filter((r) => r.connectionStatus !== "Online")
                  .slice(0, 4)}
              />
            </article>
            <article className="panel operations-stats">
              <div className="panel-heading">
                <div>
                  <h2>Workspace at a glance</h2>
                  <p>Authorized operational totals</p>
                </div>
                <Layers size={17} />
              </div>
              <dl>
                {(
                  [
                    ["Registered users", "users"],
                    ["Active users", "activeUsers"],
                    ["Surveyors", "surveyors"],
                    ["Connected controllers", "connectedControllers"],
                    ["Completed surveys", "completedSurveys"],
                    ["Active sessions", "activeSessions"],
                    ["Pending queue events", "pendingSyncEvents"],
                    ["Districts with active work", "activeDistricts"],
                  ] as const
                ).map(([label, key]) => (
                  <div key={key}>
                    <dt>{label}</dt>
                    <dd>{s ? number(s[key]) : "—"}</dd>
                  </div>
                ))}
              </dl>
              <small>
                Pending queue counts reflect the latest device-reported backlog.
              </small>
            </article>
          </section>
        </>
      )}
    </>
  );
}
