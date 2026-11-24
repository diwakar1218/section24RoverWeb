"use client";
import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import {
  Search,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  ArrowDownToLine,
} from "lucide-react";
import { useAuth } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { useRovers, useDirectory } from "@/hooks/use-monitoring";
import { ErrorState, Status } from "./dashboard";
import { time } from "@/lib/utils";
import { notify } from "@/lib/notifications";
import type { User, Survey } from "@/types";
function Table<T>({ rows, columns }: { rows: T[]; columns: ColumnDef<T>[] }) {
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });
  return (
    <div className="table-overflow">
      <table>
        <thead>
          {table.getHeaderGroups().map((g) => (
            <tr key={g.id}>
              {g.headers.map((h) => (
                <th key={h.id}>
                  {flexRender(h.column.columnDef.header, h.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((r) => (
            <tr key={r.id}>
              {r.getVisibleCells().map((c) => (
                <td key={c.id}>
                  {flexRender(c.column.columnDef.cell, c.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div className="empty-state">No records match your filters.</div>
      )}
    </div>
  );
}
export function exportCsv(
  filename: string,
  headers: string[],
  rows: (string | number | null)[][],
) {
  const escape = (value: string | number | null) => {
    let s = String(value ?? "");
    if (/^[=+@\-\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replaceAll('"', '""')}"`;
  };
  const blob = new Blob(
    [
      "\uFEFF" +
        [headers, ...rows].map((row) => row.map(escape).join(",")).join("\r\n"),
    ],
    { type: "text/csv;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  notify("Export file is ready.", "success");
}
function RoverDirectory() {
  const { profile } = useAuth(),
    query = useSearchParams(),
    [search, setSearch] = useState(query.get("search") ?? ""),
    [status, setStatus] = useState("All"),
    [page, setPage] = useState(1);
  const { data, error, isPending, refetch } = useRovers();
  const rows = (data ?? []).filter(
    (r) =>
      (status === "All" || r.connectionStatus === status) &&
      JSON.stringify([
        r.data.name,
        r.data.serialNumber,
        r.data.surveyorName,
        r.data.district,
      ])
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const size = 10,
    pages = Math.max(1, Math.ceil(rows.length / size));
  if (!profile?.grants.some((g) => g.permission === "rovers.read"))
    return (
      <ErrorState
        error={new Error("Rover access is not assigned to your account.")}
      />
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">DEVICE OPERATIONS</span>
          <h1>
            GNSS rovers<span className="heading-dot">.</span>
          </h1>
          <p>
            Monitor assigned receivers, connection freshness, and positioning
            quality.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() =>
            exportCsv(
              "authorized-rovers.csv",
              [
                "Name",
                "Serial",
                "Surveyor",
                "District",
                "Connection",
                "Fix",
                "Horizontal precision m",
                "Observed at",
              ],
              rows.map((r) => [
                r.data.name,
                r.data.serialNumber,
                r.data.surveyorName,
                r.data.district,
                r.connectionStatus,
                r.data.fixType,
                r.data.horizontalPrecision,
                r.data.observedAt,
              ]),
            )
          }
        >
          <ArrowDownToLine size={14} />
          Export CSV
        </Button>
      </div>
      {error && <ErrorState error={error} retry={() => void refetch()} />}
      <section className="panel">
        <div className="table-toolbar">
          <div className="search-field">
            <Search size={15} />
            <input
              aria-label="Search rovers"
              placeholder="Name, serial, or surveyor…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <select
            aria-label="Connection status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            {["All", "Online", "Stale", "Offline"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        {isPending ? (
          <div className="empty-state">Loading receivers…</div>
        ) : (
          <div className="table-overflow">
            <table>
              <thead>
                <tr>
                  {[
                    "Receiver",
                    "Surveyor",
                    "District",
                    "Connection",
                    "GNSS fix",
                    "H / V precision",
                    "Last observed",
                    "",
                  ].map((s, i) => (
                    <th key={i}>{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice((page - 1) * size, page * size).map((r) => (
                  <tr key={r.data.id}>
                    <td>
                      <Link href={`/dashboard/rovers/${r.data.id}`}>
                        {r.data.name}
                      </Link>
                      <small>
                        {r.data.serialNumber} · {r.data.model}
                      </small>
                    </td>
                    <td>
                      {r.data.surveyorId ? (
                        <Link href={`/dashboard/users/${r.data.surveyorId}`}>
                          {r.data.surveyorName}
                        </Link>
                      ) : (
                        "Unassigned"
                      )}
                    </td>
                    <td>{r.data.district}</td>
                    <td>
                      <Status value={r.connectionStatus} />
                    </td>
                    <td>
                      {r.data.fixType ?? "Unavailable"}
                      <small>
                        {r.receivingGnss
                          ? "Recent observation"
                          : "No recent GNSS"}
                      </small>
                    </td>
                    <td>
                      {r.data.horizontalPrecision != null
                        ? `${(r.data.horizontalPrecision * 100).toFixed(1)} cm`
                        : "—"}{" "}
                      /{" "}
                      {r.data.verticalPrecision != null
                        ? `${(r.data.verticalPrecision * 100).toFixed(1)} cm`
                        : "—"}
                    </td>
                    <td>{time(r.data.observedAt)}</td>
                    <td>
                      <Link
                        aria-label={`View ${r.data.name}`}
                        href={`/dashboard/rovers/${r.data.id}`}
                      >
                        <ArrowUpRight size={16} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && (
              <div className="empty-state">
                No authorized receivers match these filters.
              </div>
            )}
          </div>
        )}
        <div className="table-footer">
          <span>{rows.length} authorized receivers</span>
          <div>
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft size={13} />
            </Button>
            <span>
              Page {page} of {pages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= pages}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight size={13} />
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
export function Rovers() {
  return (
    <Suspense
      fallback={<div className="empty-state">Loading receiver directory…</div>}
    >
      <RoverDirectory />
    </Suspense>
  );
}
export function Directory({ kind }: { kind: "users" | "surveys" }) {
  const { profile, demo } = useAuth(),
    [page, setPage] = useState(1),
    [search, setSearch] = useState("");
  const { data, error, isPending, refetch } = useDirectory(kind, page, search);
  const columns = useMemo<ColumnDef<User | Survey>[]>(
    () =>
      kind === "users"
        ? [
            {
              header: "Name / username",
              accessorKey: "fullName",
              cell: ({ row }) => {
                const u = row.original as User;
                return (
                  <>
                    <Link href={`/dashboard/users/${u.id}`}>{u.fullName}</Link>
                    <small>{u.username}</small>
                  </>
                );
              },
            },
            {
              header: "Roles",
              cell: ({ row }) => (row.original as User).roles.join(", "),
            },
            { header: "District", accessorKey: "district" },
            {
              header: "Account",
              cell: ({ row }) => (
                <Status
                  value={
                    (row.original as User).isActive ? "Active" : "Inactive"
                  }
                />
              ),
            },
            {
              header: "Last login",
              cell: ({ row }) => time((row.original as User).lastLogin),
            },
          ]
        : [
            {
              header: "Survey job",
              cell: ({ row }) => (
                <Link href={`/dashboard/surveys/${row.original.id}`}>
                  {(row.original as Survey).name}
                </Link>
              ),
            },
            { header: "Surveyor", accessorKey: "surveyorName" },
            { header: "District", accessorKey: "district" },
            {
              header: "Workflow state",
              cell: ({ row }) => (
                <Status value={(row.original as Survey).status} />
              ),
            },
            { header: "Survey points", accessorKey: "pointCount" },
            {
              header: "Area (ha)",
              cell: ({ row }) =>
                ((row.original as Survey).areaM2 / 10000).toFixed(3),
            },
          ],
    [kind],
  );
  if (!profile?.grants.some((g) => g.permission === `${kind}.read`))
    return (
      <ErrorState
        error={
          new Error("Access to this directory is not assigned to your account.")
        }
      />
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {kind === "users" ? "PEOPLE & TEAMS" : "SURVEY OPERATIONS"}
          </span>
          <h1>
            {kind === "users" ? "People & teams" : "Survey jobs"}
            <span className="heading-dot">.</span>
          </h1>
          <p>
            {kind === "users"
              ? "Your authorized user directory, roles, and account status."
              : "Assigned work, administrative status, and recorded measurements."}
          </p>
        </div>
      </div>
      {kind === "surveys" && <div className="directory-actions"><Button asChild variant="outline"><Link href="/dashboard/mobile-surveys">View uploaded field surveys <ArrowUpRight size={14}/></Link></Button></div>}
      {!demo &&
        (kind === "users"
          ? ["users.manage", "roles.manage"].every((permission) =>
              profile?.grants.some(
                (g) =>
                  g.permission === permission && g.scope === "Organization",
              ),
            )
          : profile?.grants.some((g) => g.permission === "surveys.manage")) && (
          <div className="directory-actions">
            <Button asChild>
              <Link href={`/dashboard/${kind}/create`}>
                {kind === "users" ? "Add user" : "Create survey job"}
              </Link>
            </Button>
          </div>
        )}
      {demo && (
        <div className="detail-notice">
          Browser demo is read-only. Sign in to an API-backed organization to
          create users, assign jobs and run survey workflow actions.
        </div>
      )}
      {error && <ErrorState error={error} retry={() => void refetch()} />}
      <section className="panel">
        <div className="table-toolbar">
          <div className="search-field">
            <Search size={15} />
            <input
              value={search}
              aria-label={`Search ${kind}`}
              placeholder={
                kind === "users"
                  ? "Search by name or username…"
                  : "Search survey jobs…"
              }
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
            />
          </div>
          <span className="muted">{data?.total ?? "—"} records</span>
        </div>
        {isPending ? (
          <div className="empty-state">Loading authorized records…</div>
        ) : (
          <Table rows={data?.items ?? []} columns={columns} />
        )}
        <div className="table-footer">
          <span>Page {page} · 10 records per page</span>
          <div>
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!data || page * 10 >= data.total}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
