"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeft,
  Save,
  ShieldCheck,
  History,
  ClipboardList,
  UserPlus,
} from "lucide-react";
import { useAuth } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { request } from "@/services/api";
import { notify } from "@/lib/notifications";
import { GeographyFields, resolveGeography, type GeographyValue } from "@/components/geography-fields";
import { time } from "@/lib/utils";
import { ErrorState, Status } from "./dashboard";
import { RecordDetails } from "./details";
import type {
  Profile,
  GeographyOptions,
  RoleOption,
  ManagedUser,
  ManagedSurvey,
  AssignmentOptions,
} from "@/types";

export const organizationGrant = (
  profile: Profile | null,
  permission: string,
) =>
  !!profile?.grants.some(
    (g) => g.permission === permission && g.scope === "Organization",
  );
const has = (profile: Profile | null, permission: string) =>
  !!profile?.grants.some((g) => g.permission === permission);
type Geo = GeographyValue;
function ManagementHeading({
  title,
  back,
  subtitle,
}: {
  title: string;
  back: string;
  subtitle: string;
}) {
  return (
    <>
      <Link href={back} className="back-link">
        <ArrowLeft size={14} />
        Back
      </Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">WORKSPACE MANAGEMENT</span>
          <h1>
            {title}
            <span className="heading-dot">.</span>
          </h1>
          <p>{subtitle}</p>
        </div>
      </div>
    </>
  );
}
const userSchema = z.object({
  fullName: z.string().trim().min(1, "Enter a full name").max(160),
  username: z
    .string()
    .regex(
      /^[a-z0-9][a-z0-9._-]{2,63}$/,
      "Use 3–64 lowercase letters, numbers, dots, underscores or hyphens",
    ),
  initialPassword: z.string().max(256),
  roleIds: z.array(z.string()).min(1, "Select at least one role"),
});
type UserFields = z.infer<typeof userSchema>;
export function UserEditor({ id }: { id?: string }) {
  const { profile, demo } = useAuth(),
    allowed =
      organizationGrant(profile, "users.manage") &&
      organizationGrant(profile, "roles.manage");
  const geo = useQuery({
    queryKey: ["management", "geography"],
    queryFn: () => request<GeographyOptions>("/geography"),
    enabled: allowed && !demo,
  });
  const roles = useQuery({
    queryKey: ["management", "roles"],
    queryFn: () => request<RoleOption[]>("/roles"),
    enabled: allowed && !demo,
  });
  const user = useQuery({
    queryKey: ["monitoring", "managed-user", id],
    queryFn: () => request<ManagedUser>(`/users/${id}/management`),
    enabled: !!id && allowed && !demo,
  });
  if (demo)
    return (
      <ErrorState
        error={
          new Error(
            "Browser demo is read-only. Sign in to an API-backed organization to manage users.",
          )
        }
      />
    );
  if (!allowed)
    return (
      <ErrorState
        error={
          new Error(
            "Organizational user and role-management permissions are required.",
          )
        }
      />
    );
  if (geo.error || roles.error || user.error)
    return <ErrorState error={geo.error ?? roles.error ?? user.error} />;
  if (!geo.data || !roles.data || (id && !user.data))
    return <div className="empty-state">Loading management options…</div>;
  return (
    <UserForm
      key={id ?? "create"}
      id={id}
      user={user.data}
      geography={geo.data}
      roles={roles.data}
    />
  );
}
function UserForm({
  id,
  user,
  geography,
  roles,
}: {
  id?: string;
  user?: ManagedUser;
  geography: GeographyOptions;
  roles: RoleOption[];
}) {
  const [expectedVersion] = useState(user?.version ?? 0);
  const router = useRouter(),
    client = useQueryClient(),
    { profile } = useAuth();
  const [geo, setGeo] = useState<Geo>({
    stateId: user?.profile.stateId ?? "",
    districtId: user?.profile.districtId ?? "",
    tehsilId: user?.profile.tehsilId ?? "",
    villageId: user?.profile.villageId ?? "",
  });
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<UserFields>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      fullName: user?.profile.fullName ?? "",
      username: user?.profile.username ?? "",
      initialPassword: "",
      roleIds: user?.roleIds ?? [],
    },
  });
  const save = useMutation({
    meta: { successMessage: id ? "User updated successfully." : "User created successfully." },
    mutationFn: async (values: UserFields) => {
      const selected = await resolveGeography(geo);
      return request<{ id: string } | undefined>(id ? `/users/${id}` : "/users", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify({
          ...values,
          initialPassword: id ? null : values.initialPassword,
          ...selected,
          expectedVersion,
        }),
      });
    },
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: ["monitoring"] });
      if (id === profile?.userId) {
        window.location.assign(`/dashboard/users/${id}`);
        return;
      }
      router.push(`/dashboard/users/${id ?? result!.id}`);
    },
  });
  return (
    <>
      <ManagementHeading
        title={id ? "Edit user" : "Create user"}
        back={id ? `/dashboard/users/${id}` : "/dashboard/users"}
        subtitle="Assign roles and geographical access with a recorded audit trail."
      />
      <form
        className="panel management-form"
        onSubmit={handleSubmit((values) => {
          if (!id && values.initialPassword.length < 8) {
            setError("initialPassword", {
              message: "Use an initial password of at least 8 characters",
            });
            notify("Use an initial password of at least 8 characters", "warning");
            return;
          }
          save.mutate(values);
        }, (errors) => notify(Object.values(errors).find(error => error?.message)?.message ?? "Check the required user fields.", "warning"))}
      >
        <div className="panel-heading">
          <h2>
            <UserPlus size={16} />
            Account details
          </h2>
          <span className="tiny-badge">
            {id ? `Version ${user?.version}` : "New account"}
          </span>
        </div>
        <div className="form-body">
          <div className="form-grid">
            <label>
              Full name
              <input
                autoComplete="name"
                maxLength={160}
                {...register("fullName")}
              />
              {errors.fullName && (
                <small className="error-text">{errors.fullName.message}</small>
              )}
            </label>
            <label>
              Username
              <input autoComplete="username" {...register("username")} />
              {errors.username && (
                <small className="error-text">{errors.username.message}</small>
              )}
            </label>
            {!id && (
              <label>
                Initial password
                <input
                  type="password"
                  autoComplete="new-password"
                  {...register("initialPassword")}
                />
                <small>
                  At least 8 characters. Share through your approved secure
                  channel.
                </small>
                {errors.initialPassword && (
                  <small className="error-text">
                    {errors.initialPassword.message}
                  </small>
                )}
              </label>
            )}
          </div>
          <fieldset>
            <legend>Roles</legend>
            <div className="role-options">
              {roles.map((role) => (
                <label key={role.id}>
                  <input
                    type="checkbox"
                    value={role.id}
                    {...register("roleIds")}
                  />
                  <span>
                    <strong>{role.name}</strong>
                    <small>{role.scope} scope</small>
                  </span>
                </label>
              ))}
            </div>
            {errors.roleIds && (
              <small className="error-text">{errors.roleIds.message}</small>
            )}
          </fieldset>
          <fieldset>
            <legend>Geographical jurisdiction</legend>
            <p className="form-help">
              Jurisdiction roles require a district. Selecting a tehsil
              or village narrows access.
            </p>
            <GeographyFields data={geography} value={geo} onChange={setGeo} />
          </fieldset>
          {save.error && <ErrorState error={save.error} />}
          <div className="form-actions">
            <span>
              <ShieldCheck size={14} />
              Changes are permission-checked and audited.
            </span>
            <Button disabled={save.isPending} type="submit">
              <Save size={15} />
              {save.isPending ? "Saving…" : "Save user"}
            </Button>
          </div>
        </div>
      </form>
    </>
  );
}
export function UserManagementDetails({ id }: { id: string }) {
  const { profile, demo } = useAuth(),
    client = useQueryClient(),
    allowed = has(profile, "users.read");
  const q = useQuery({
    queryKey: ["monitoring", "managed-user", id],
    queryFn: () => request<ManagedUser>(`/users/${id}/management`),
    enabled: allowed && !demo,
  });
  const status = useMutation({
    mutationFn: () =>
      request(`/users/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          isActive: !q.data!.profile.isActive,
          expectedVersion: q.data!.version,
        }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["monitoring"] }),
  });
  if (demo) return <RecordDetails kind="users" id={id} />;
  if (!allowed)
    return <ErrorState error={new Error("User access is not assigned.")} />;
  if (q.error)
    return <ErrorState error={q.error} retry={() => void q.refetch()} />;
  if (!q.data) return <div className="empty-state">Loading user…</div>;
  const u = q.data.profile;
  return (
    <>
      <ManagementHeading
        title={u.fullName}
        back="/dashboard/users"
        subtitle="Account, roles, jurisdiction and administrative controls."
      />
      {status.error && (
        <ErrorState error={status.error} retry={() => void q.refetch()} />
      )}
      <section className="panel">
        <div className="panel-heading">
          <h2>User profile</h2>
          <Status value={u.isActive ? "Active" : "Inactive"} />
        </div>
        <dl className="detail-values">
          {[
            ["Username", u.username],
            ["Roles", u.roles.join(", ")],
            ["District", u.district ?? "Unassigned"],
            ["Last login", time(u.lastLogin)],
            ["Record version", q.data.version],
          ].map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        {organizationGrant(profile, "users.manage") && (
          <div className="form-actions form-body">
            {organizationGrant(profile, "roles.manage") && (
              <Button asChild variant="outline">
                <Link href={`/dashboard/users/${id}/edit`}>
                  Edit user & roles
                </Link>
              </Button>
            )}
            <Button
              variant="outline"
              disabled={status.isPending || id === profile?.userId}
              onClick={() => status.mutate()}
            >
              {status.isPending
                ? "Updating…"
                : u.isActive
                  ? "Deactivate account"
                  : "Activate account"}
            </Button>
          </div>
        )}
      </section>
    </>
  );
}
const surveySchema = z.object({
  name: z.string().trim().min(1, "Enter a survey name").max(200),
  sourceCrs: z.string().min(1, "Enter the source CRS").max(200),
  priority: z.enum(["Low", "Normal", "High", "Urgent"]),
});
type SurveyFields = z.infer<typeof surveySchema>;
export function SurveyEditor({ id }: { id?: string }) {
  const { profile, demo } = useAuth(),
    allowed = has(profile, "surveys.manage");
  const geo = useQuery({
    queryKey: ["management", "geography"],
    queryFn: () => request<GeographyOptions>("/geography"),
    enabled: allowed && !demo,
  });
  const job = useQuery({
    queryKey: ["monitoring", "managed-survey", id],
    queryFn: () => request<ManagedSurvey>(`/surveys/${id}/management`),
    enabled: !!id && allowed && !demo,
  });
  if (demo || !allowed)
    return (
      <ErrorState
        error={
          new Error(
            demo
              ? "Browser demo is read-only. Sign in to create or edit jobs."
              : "Survey management permission is required.",
          )
        }
      />
    );
  if (geo.error || job.error)
    return <ErrorState error={geo.error ?? job.error} />;
  if (!geo.data || (id && !job.data))
    return <div className="empty-state">Loading job options…</div>;
  if (job.data && job.data.profile.status !== "Draft")
    return (
      <ErrorState error={new Error("Only draft job details can be edited.")} />
    );
  return <SurveyForm id={id} job={job.data} geography={geo.data} />;
}
function SurveyForm({
  id,
  job,
  geography,
}: {
  id?: string;
  job?: ManagedSurvey;
  geography: GeographyOptions;
}) {
  const [expectedVersion] = useState(job?.version ?? 0);
  const client = useQueryClient(),
    router = useRouter(),
    [geo, setGeo] = useState<Geo>({
      stateId: job?.profile.stateId ?? "",
      districtId: job?.profile.districtId ?? "",
      tehsilId: job?.profile.tehsilId ?? "",
      villageId: job?.profile.villageId ?? "",
    });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SurveyFields>({
    resolver: zodResolver(surveySchema),
    defaultValues: {
      name: job?.profile.name ?? "",
      sourceCrs: job?.sourceCrs ?? "EPSG:4326",
      priority: (job?.priority as SurveyFields["priority"]) ?? "Normal",
    },
  });
  const save = useMutation({
    mutationFn: async (values: SurveyFields) => {
      const selected = await resolveGeography(geo);
      if (!selected.districtId) throw new Error("Select a district.");
      return request<{ id: string } | undefined>(id ? `/surveys/${id}` : "/surveys", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify({
          ...values,
          districtId: selected.districtId,
          tehsilId: selected.tehsilId,
          villageId: selected.villageId,
          expectedVersion,
        }),
      });
    },
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: ["monitoring"] });
      router.push(`/dashboard/surveys/${id ?? result!.id}`);
    },
  });
  return (
    <>
      <ManagementHeading
        title={id ? "Edit survey job" : "Create survey job"}
        back={id ? `/dashboard/surveys/${id}` : "/dashboard/surveys"}
        subtitle="Create a draft, then assign a surveyor and connected devices."
      />
      <form
        className="panel management-form"
        onSubmit={handleSubmit((values) => save.mutate(values), (errors) => notify(Object.values(errors).find(error => error?.message)?.message ?? "Check the required survey fields.", "warning"))}
      >
        <div className="panel-heading">
          <h2>
            <ClipboardList size={16} />
            Job details
          </h2>
          <Status value="Draft" />
        </div>
        <div className="form-body">
          <div className="form-grid">
            <label>
              Survey name
              <input {...register("name")} maxLength={200} />
              {errors.name && (
                <small className="error-text">{errors.name.message}</small>
              )}
            </label>
            <label>
              Priority
              <select aria-label="Priority" {...register("priority")}>
                {["Low", "Normal", "High", "Urgent"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              Source coordinate reference system
              <input {...register("sourceCrs")} />
              {errors.sourceCrs && (
                <small className="error-text">{errors.sourceCrs.message}</small>
              )}
              <small>
                Record the job's original CRS. No coordinate conversion is
                implied.
              </small>
            </label>
          </div>
          <fieldset>
            <legend>Survey jurisdiction</legend>
            <GeographyFields
              data={geography}
              value={geo}
              onChange={setGeo}
              requireDistrict
            />
          </fieldset>
          {save.error && <ErrorState error={save.error} />}
          <div className="form-actions">
            <span>Job creation does not start a field session.</span>
            <Button type="submit" disabled={save.isPending}>
              <Save size={15} />
              {save.isPending ? "Saving…" : "Save draft"}
            </Button>
          </div>
        </div>
      </form>
    </>
  );
}
const commands: Record<
  string,
  { key: string; label: string; permission: string }[]
> = {
  Draft: [{ key: "cancel", label: "Cancel job", permission: "surveys.manage" }],
  Assigned: [
    { key: "start", label: "Start survey", permission: "surveys.operate" },
    { key: "cancel", label: "Cancel job", permission: "surveys.manage" },
  ],
  InProgress: [
    { key: "pause", label: "Pause survey", permission: "surveys.operate" },
    { key: "stop", label: "Stop session", permission: "surveys.operate" },
    {
      key: "submit",
      label: "Submit for review",
      permission: "surveys.operate",
    },
  ],
  Paused: [
    { key: "resume", label: "Resume survey", permission: "surveys.operate" },
    { key: "stop", label: "Stop session", permission: "surveys.operate" },
    {
      key: "submit",
      label: "Submit for review",
      permission: "surveys.operate",
    },
  ],
  Submitted: [
    { key: "review", label: "Begin review", permission: "surveys.review" },
  ],
  UnderReview: [
    { key: "approve", label: "Approve survey", permission: "surveys.review" },
    { key: "reject", label: "Reject survey", permission: "surveys.review" },
  ],
  Approved: [
    { key: "complete", label: "Mark completed", permission: "surveys.review" },
  ],
};
const duration = (seconds: number) =>
  `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ${Math.floor(seconds % 60)}s`;
export function SurveyManagementDetails({ id }: { id: string }) {
  const { profile, demo } = useAuth(),
    client = useQueryClient(),
    [reason, setReason] = useState("");
  const q = useQuery({
    queryKey: ["monitoring", "managed-survey", id],
    queryFn: () => request<ManagedSurvey>(`/surveys/${id}/management`),
    enabled: has(profile, "surveys.read") && !demo,
    refetchInterval: 15000,
  });
  const action = useMutation({
    mutationFn: (command: string) =>
      request(`/surveys/${id}/${command}`, {
        method: "POST",
        body: JSON.stringify({
          expectedVersion: q.data!.version,
          reason: reason || null,
        }),
      }),
    onSuccess: async () => {
      setReason("");
      await client.invalidateQueries({ queryKey: ["monitoring"] });
    },
  });
  if (demo) return <RecordDetails kind="surveys" id={id} />;
  if (!has(profile, "surveys.read"))
    return <ErrorState error={new Error("Survey access is not assigned.")} />;
  if (q.error)
    return <ErrorState error={q.error} retry={() => void q.refetch()} />;
  if (!q.data) return <div className="empty-state">Loading survey…</div>;
  const job = q.data,
    s = job.profile,
    actions = (commands[s.status] ?? []).filter((c) =>
      has(profile, c.permission),
    );
  return (
    <>
      <ManagementHeading
        title={s.name}
        back="/dashboard/surveys"
        subtitle="Administrative workflow and explicit survey session controls."
      />
      <div className="detail-grid">
        <article className="panel">
          <div className="panel-heading">
            <h2>Survey information</h2>
            <Status value={s.status} />
          </div>
          <dl className="detail-values">
            {[
              ["District", s.district ?? "Unassigned"],
              ["Surveyor", s.surveyorName ?? "Unassigned"],
              ["Priority", job.priority],
              ["Source CRS", job.sourceCrs],
              ["Points recorded", s.pointCount],
              ["Area", `${(s.areaM2 / 10000).toFixed(4)} ha`],
              ["Version", job.version],
            ].map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {s.status === "Draft" && has(profile, "surveys.manage") && (
            <div className="form-body">
              <Button asChild variant="outline">
                <Link href={`/dashboard/surveys/${id}/edit`}>Edit draft</Link>
              </Button>
            </div>
          )}
        </article>
        <article className="panel">
          <div className="panel-heading">
            <h2>Workflow actions</h2>
            <ShieldCheck size={17} />
          </div>
          <div className="form-body">
            <p className="form-help">
              Pause keeps the session open. Stop closes it and leaves the job
              paused; resume starts a new session. These controls do not confirm
              receiver measurement activity.
            </p>
            {actions.length > 0 && (
              <label>
                Action reason
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Required for rejection or cancellation"
                />
              </label>
            )}
            <div className="workflow-actions">
              {actions.map((c) => (
                <Button
                  key={c.key}
                  variant={
                    c.key === "cancel" || c.key === "reject"
                      ? "outline"
                      : "default"
                  }
                  disabled={
                    action.isPending ||
                    (["reject", "cancel"].includes(c.key) && !reason.trim()) ||
                    (c.key === "stop" && !job.sessions.some((s) => !s.endedAt))
                  }
                  onClick={() => action.mutate(c.key)}
                >
                  {action.isPending ? "Updating…" : c.label}
                </Button>
              ))}
            </div>
            {!actions.length && (
              <p className="muted">
                No workflow actions are available for your permissions and this
                state.
              </p>
            )}
            {action.error && (
              <ErrorState error={action.error} retry={() => void q.refetch()} />
            )}
          </div>
        </article>
      </div>
      {has(profile, "surveys.manage") &&
        ["Draft", "Assigned", "Rejected"].includes(s.status) && (
          <AssignmentForm key={`${id}-${job.version}`} id={id} job={job} />
        )}
      <section className="panel management-section">
        <div className="panel-heading">
          <h2>Survey sessions</h2>
          <span className="tiny-badge">Server-recorded controls</span>
        </div>
        <div className="table-overflow">
          <table>
            <thead>
              <tr>
                {[
                  "Started",
                  "Ended",
                  "Session duration",
                  "Active session time",
                  "Paused time",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {job.sessions.map((row) => (
                <tr key={row.id}>
                  <td>{time(row.startedAt)}</td>
                  <td>{row.endedAt ? time(row.endedAt) : "Open"}</td>
                  <td>{duration(row.sessionSeconds)}</td>
                  <td>{duration(row.activeSeconds)}</td>
                  <td>{duration(row.pausedSeconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!job.sessions.length && (
            <div className="empty-state">No survey sessions yet.</div>
          )}
        </div>
        <p className="form-help form-body">
          Active session time excludes explicit pauses. It is separate from
          measurement duration, login time and Internet connectivity.
        </p>
      </section>
      <section className="panel management-section">
        <div className="panel-heading">
          <h2>
            <History size={16} />
            Workflow history
          </h2>
        </div>
        <div className="table-overflow">
          <table>
            <thead>
              <tr>
                {["Time (IST)", "From", "To", "Changed by", "Reason"].map(
                  (h) => (
                    <th key={h}>{h}</th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {job.history.map((h) => (
                <tr key={h.id}>
                  <td>{time(h.occurredAt)}</td>
                  <td>{h.fromStatus}</td>
                  <td>{h.toStatus}</td>
                  <td>{h.changedBy}</td>
                  <td>{h.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!job.history.length && (
            <div className="empty-state">No workflow transitions yet.</div>
          )}
        </div>
      </section>
    </>
  );
}
function AssignmentForm({ id, job }: { id: string; job: ManagedSurvey }) {
  const client = useQueryClient(),
    [surveyor, setSurveyor] = useState(job.profile.surveyorId ?? ""),
    [rover, setRover] = useState(job.roverId ?? "");
  const q = useQuery({
    queryKey: ["monitoring", "assignment-options", id],
    queryFn: () =>
      request<AssignmentOptions>(`/surveys/${id}/assignment-options`),
  });
  const controller = q.data?.controllers.find((c) => c.receiverId === rover);
  const save = useMutation({
    mutationFn: () =>
      request(`/surveys/${id}/assign`, {
        method: "POST",
        body: JSON.stringify({
          surveyorId: surveyor,
          roverId: rover,
          controllerId: controller?.id,
          expectedVersion: job.version,
        }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["monitoring"] }),
  });
  return (
    <section className="panel management-section">
      <div className="panel-heading">
        <h2>Team & device assignment</h2>
      </div>
      <form
        className="form-body"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <p className="form-help">
          A surveyor and each device can have one active job. Devices already
          assigned elsewhere must be released by completing or cancelling that
          job.
        </p>
        {q.error && <ErrorState error={q.error} />}
        <div className="form-grid">
          <label>
            Surveyor
            <select
              aria-label="Surveyor"
              value={surveyor}
              onChange={(e) => setSurveyor(e.target.value)}
              required
            >
              <option value="">Select surveyor</option>
              {q.data?.surveyors.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
            </select>
          </label>
          <label>
            GNSS rover
            <select
              aria-label="GNSS rover"
              value={rover}
              onChange={(e) => setRover(e.target.value)}
              required
            >
              <option value="">Select rover</option>
              {q.data?.rovers.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} · {r.serialNumber}
                </option>
              ))}
            </select>
          </label>
          <label>
            Connected controller
            <input
              readOnly
              value={
                controller
                  ? `${controller.identifier} · ${controller.model}`
                  : "No connected controller selected"
              }
            />
          </label>
        </div>
        {save.error && <ErrorState error={save.error} />}
        <div className="form-actions">
          <span>Assignments and status changes are recorded atomically.</span>
          <Button
            disabled={save.isPending || !controller || !surveyor}
            type="submit"
          >
            {save.isPending ? "Assigning…" : "Assign team"}
          </Button>
        </div>
      </form>
    </section>
  );
}
