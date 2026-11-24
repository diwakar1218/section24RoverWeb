"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Radio } from "lucide-react";
import { useAuth } from "@/components/providers";
import { request } from "@/services/api";
import { demoUsers, demoSurveys } from "@/services/demo";
import { useRovers, useLive } from "@/hooks/use-monitoring";
import { ErrorState, Status } from "./dashboard";
import { time } from "@/lib/utils";
import type { User, Survey } from "@/types";
const RoverMap = dynamic(() => import("@/components/rover-map"), {
  ssr: false,
});
function Values({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="detail-values">
      {items.map(([key, value]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>{value ?? "Unavailable"}</dd>
        </div>
      ))}
    </dl>
  );
}
export function RoverDetails({ id }: { id: string }) {
  const { profile } = useAuth(),
    { data, error, isPending } = useRovers(),
    live = useLive(),
    r = data?.find((r) => r.data.id === id);
  if (!profile?.grants.some((g) => g.permission === "rovers.read"))
    return <ErrorState error={new Error("Rover access is not assigned.")} />;
  if (error) return <ErrorState error={error} />;
  if (isPending) return <div className="empty-state">Loading receiver…</div>;
  if (!r)
    return (
      <ErrorState
        error={new Error("Receiver not found in your permitted jurisdiction.")}
      />
    );
  const d = r.data;
  return (
    <>
      <Link href="/dashboard/rovers" className="back-link">
        <ArrowLeft size={14} />
        All rovers
      </Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">RECEIVER INTELLIGENCE</span>
          <h1>
            {d.name}
            <span className="heading-dot">.</span>
          </h1>
          <p>
            {d.serialNumber} · {d.model} · {live}
          </p>
        </div>
        <Status value={r.connectionStatus} />
      </div>
      <div className="detail-grid">
        <article className="panel">
          <div className="panel-heading">
            <h2>
              <Radio size={16} />
              Receiver & assignment
            </h2>
          </div>
          <Values
            items={[
              ["Receiver ID", d.id],
              ["Serial number", d.serialNumber],
              [
                "Surveyor",
                d.surveyorId ? (
                  <Link href={`/dashboard/users/${d.surveyorId}`}>
                    {d.surveyorName}
                  </Link>
                ) : (
                  "Unassigned"
                ),
              ],
              ["District", d.district],
              [
                "Job",
                d.jobId ? (
                  <Link href={`/dashboard/${d.source === "android" ? "mobile-surveys" : "surveys"}/${encodeURIComponent(d.jobId)}`}>
                    {d.jobName}
                  </Link>
                ) : (
                  "Unassigned"
                ),
              ],
              [
                "Administrative job status",
                <Status key="status" value={d.surveyStatus} />,
              ],
              ["Controller contact", time(d.lastHeartbeat)],
              ["Last synchronization", time(d.lastSyncAt)],
              [
                "Data source",
                d.source === "android" ? "Android app telemetry" : d.isDemo ? "Simulated device" : "Registered field device",
              ],
              ...(d.source === "android" ? [
                ["App contact", d.controllerStatus],
                ["App in foreground", d.foreground == null ? "Unknown" : d.foreground ? "Yes" : "No"],
                ["Rover reported connected", d.roverReportedConnected == null ? "Unknown" : d.roverReportedConnected ? "Yes" : "No"],
                ["Tehsil / village", `${d.tehsil || "—"} / ${d.village || "—"}`],
                ["Gata / case", `${d.gataNo || "—"} / ${d.caseNo || "—"}`],
                ["Pending sync operations", d.pendingSync ?? "Unavailable"],
              ] as [string, React.ReactNode][] : []),
            ]}
          />
        </article>
        <article className="panel">
          <div className="panel-heading">
            <h2>GNSS observations</h2>
          </div>
          <Values
            items={[
              [
                "Latitude / longitude",
                d.latitude != null && d.longitude != null
                  ? `${d.latitude.toFixed(8)}, ${d.longitude.toFixed(8)}`
                  : "Not received",
              ],
              [
                "Ellipsoidal height",
                d.height != null ? `${d.height.toFixed(3)} m` : "Unavailable",
              ],
              ["GNSS fix type", d.fixType],
              [
                "Horizontal precision",
                d.horizontalPrecision != null
                  ? `${d.horizontalPrecision} m`
                  : "Unavailable",
              ],
              [
                "Vertical precision",
                d.verticalPrecision != null
                  ? `${d.verticalPrecision} m`
                  : "Unavailable",
              ],
              ["Original observation time", time(d.observedAt)],
              ["Server receipt time", time(d.receivedAt)],
              ["Recent GNSS data", r.receivingGnss ? "Yes" : "No"],
              ["Active survey", r.activeSurvey ? "Yes" : "No"],
            ]}
          />
        </article>
        <article className="panel map-panel">
          <div className="panel-heading">
            <h2>Last known receiver location</h2>
          </div>
          <RoverMap rovers={[r]} focusedId={id} />
        </article>
      </div>
    </>
  );
}
export function RecordDetails({
  kind,
  id,
}: {
  kind: "users" | "surveys";
  id: string;
}) {
  const { demo, profile } = useAuth(),
    permission = profile?.grants.some((g) => g.permission === `${kind}.read`);
  const q = useQuery({
    queryKey: ["monitoring", kind, id],
    queryFn: () =>
      demo
        ? Promise.resolve(
            (kind === "users" ? demoUsers() : demoSurveys()).find(
              (x) => x.id === id,
            ),
          )
        : request<User | Survey>(`/${kind}/${id}`),
    enabled: !!permission,
  });
  if (!permission)
    return (
      <ErrorState
        error={new Error("This information is outside your permissions.")}
      />
    );
  if (q.error) return <ErrorState error={q.error} />;
  if (q.isPending) return <div className="empty-state">Loading details…</div>;
  if (!q.data) return <ErrorState error={new Error("Record not found.")} />;
  const u = q.data as User,
    s = q.data as Survey;
  return (
    <>
      <Link href={`/dashboard/${kind}`} className="back-link">
        <ArrowLeft size={14} />
        Back to {kind}
      </Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {kind === "users" ? "USER PROFILE" : "SURVEY JOB"}
          </span>
          <h1>
            {kind === "users" ? u.fullName : s.name}
            <span className="heading-dot">.</span>
          </h1>
          <p>Authorized record details</p>
        </div>
      </div>
      <article className="panel">
        <div className="panel-heading">
          <h2>Record information</h2>
        </div>
        <Values
          items={
            kind === "users"
              ? [
                  ["User ID", u.id],
                  ["Full name", u.fullName],
                  ["Username", u.username],
                  ["Roles", u.roles.join(", ")],
                  ["District", u.district],
                  ["Account status", u.isActive ? "Active" : "Inactive"],
                  ["Last login", time(u.lastLogin)],
                ]
              : [
                  ["Job ID", s.id],
                  ["Name", s.name],
                  ["Surveyor", s.surveyorName],
                  ["District", s.district],
                  ["Workflow state", s.status],
                  ["Recorded points", s.pointCount],
                  ["Measured area", `${(s.areaM2 / 10000).toFixed(4)} ha`],
                ]
          }
        />
      </article>
      <div className="detail-notice" style={{ marginTop: 20 }}>
        Assignment history, activity duration, boundary editing, and
        administrative actions will be added in subsequent increments.
        Connection time is not counted as working duration.
      </div>
    </>
  );
}
