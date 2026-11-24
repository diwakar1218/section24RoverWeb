"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, KeyRound, Plus, Radio, ShieldCheck, ShieldX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API, request } from "@/services/api";
import { notify, errorMessage } from "@/lib/notifications";
import { time } from "@/lib/utils";
import type { DeviceRegistration } from "@/types";

type Action = "create" | "approve" | "revoke" | "key" | "receiver";
type ReceiverOption = { id: string; name: string; serialNumber: string; controllerId: string | null };
type IssuedKey = { registrationId: string; deviceKey: string; expiresAt: string; version: number };

export function DeviceEnrollment({ current, changed, pending = false }: { current?: DeviceRegistration; changed: (id: string) => void; pending?: boolean }) {
  const [action, setAction] = useState<Action | null>(null);
  // Capture the target and its version when opening: a polling refresh must not
  // silently change the controller or overwrite a concurrent administrator's work.
  const [target, setTarget] = useState<DeviceRegistration>();
  function open(next: Action) { setTarget(next === "create" ? undefined : current); setAction(next); }
  return <div className="enrollment-actions" aria-busy={pending}>
    <Button size="sm" disabled={pending} onClick={() => open("create")}><Plus size={16} />Add device</Button>
    {current?.status === "Pending" && <Button size="sm" disabled={pending} variant="outline" onClick={() => open("approve")}><ShieldCheck size={16} />Approve device</Button>}
    {current?.status === "Approved" && <Button size="sm" disabled={pending} variant="outline" onClick={() => open("key")}><KeyRound size={16} />{current.credentialExpiresAt ? "Replace key" : "Generate key"}</Button>}
    {current && current.status !== "Revoked" && <>
      <Button size="sm" disabled={pending} variant="outline" onClick={() => open("receiver")}><Radio size={16} />Assign receiver</Button>
      <Button size="sm" disabled={pending} variant="outline" onClick={() => open("revoke")}><ShieldX size={16} />Revoke device</Button>
    </>}
    {action && <EnrollmentDialog action={action} device={target} close={() => setAction(null)} changed={changed} />}
  </div>;
}

function EnrollmentDialog({ action, device, close, changed }: {
  action: Action; device?: DeviceRegistration; close: () => void; changed: (id: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [issued, setIssued] = useState<IssuedKey>();
  const [copied, setCopied] = useState("");
  const [receiver, setReceiver] = useState(device?.receiverId ?? "");
  const receivers = useQuery({ queryKey: ["monitoring", "device-receiver-options"], queryFn: () => request<ReceiverOption[]>("/devices/receiver-options"), enabled: action === "create" || action === "receiver", staleTime: 0 });
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = dialog.current;
    node?.showModal();
    return () => { node?.close(); previous?.focus(); };
  }, []);
  const title = action === "create" ? "Add a controller" : action === "approve" ? "Approve this device?" : action === "revoke" ? "Revoke this device?" : action === "receiver" ? "Assign a GNSS receiver" : issued ? "Save your device key" : "Generate a device key";
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setCopied("Copied. Store the key securely before closing."); notify("Copied to clipboard.","success"); }
    catch { setCopied("Copy unavailable. Select the key text and copy it manually."); notify("Copy unavailable. Select the key text and copy it manually.","warning"); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || issued) return;
    setBusy(true); setError("");
    const values = new FormData(event.currentTarget);
    try {
      if (action === "create") {
        const result = await request<{ id: string }>("/devices/registrations", { method: "POST", body: JSON.stringify({
          identifier: String(values.get("identifier")).trim(), model: String(values.get("model")).trim(),
          pluginVersion: String(values.get("pluginVersion")).trim(), receiverId: receiver || null,
        }) });
        notify("Controller registered successfully.","success"); changed(result.id); close();
      } else if (device) {
        const path = `/devices/registrations/${device.id}`;
        if (action === "key") {
          const result = await request<IssuedKey>(`${path}/keys`, { method: "POST", body: JSON.stringify({ validDays: Number(values.get("validDays")), expectedVersion: device.version }) });
          notify("Device key generated. Save it before closing.","success"); setIssued(result); changed(device.id);
        } else {
          await request(action === "receiver" ? `${path}/receiver` : `${path}/status`, {
            method: action === "receiver" ? "PUT" : "PATCH",
            body: JSON.stringify(action === "receiver" ? { receiverId: receiver || null, expectedVersion: device.version } : { status: action === "approve" ? "Approved" : "Revoked", expectedVersion: device.version }),
          });
          notify("Device updated successfully.","success"); changed(device.id); close();
        }
      }
    } catch (e) {
      notify(errorMessage(e));
      setError(e instanceof Error ? e.message : "The device could not be updated.");
      if (device) changed(device.id);
    } finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="enrollment-dialog" aria-labelledby="enrollment-title" onCancel={e => { e.preventDefault(); if (!busy && !issued) close(); }}>
    <div className="enrollment-title"><div><span className="eyebrow">DEVICE ADMINISTRATION</span><h2 id="enrollment-title">{title}</h2></div>{!busy && !issued && <button className="icon-button" aria-label="Close device dialog" onClick={close}><X size={19} /></button>}</div>
    {device && <p className="enrollment-target"><strong>{device.model}</strong><br />{device.identifier}</p>}
    {issued ? <div className="enrollment-body">
      <div className="enrollment-notice"><strong>This key is shown once.</strong><p>Copy it into this device's Survey Command → Configure live upload. Previous keys for this registration no longer work.</p></div>
      <label className="enrollment-key-label" htmlFor="issued-device-key">Device key</label>
      <textarea id="issued-device-key" readOnly value={issued.deviceKey} rows={3} spellCheck={false} autoComplete="off" />
      <Button size="sm" variant="outline" onClick={() => void copy(issued.deviceKey)}><Copy size={15} />Copy device key</Button>
      <p role="status" className="enrollment-copy">{copied}</p>
      <dl className="enrollment-values"><div><dt>API address</dt><dd>{API}</dd></div><div><dt>Key expires (IST)</dt><dd>{time(issued.expiresAt)}</dd></div><div><dt>Registration ID</dt><dd>{issued.registrationId}</dd></div><div><dt>Rover ID</dt><dd>{device?.receiverId ?? "Assign a receiver first"}</dd></div><div><dt>Receiver serial</dt><dd>{device?.receiverSerial ?? "Not assigned"}</dd></div><div><dt>Job ID</dt><dd>{device?.jobId ?? "Assign a survey job first"}</dd></div><div><dt>Access job name</dt><dd>{device?.jobName ?? "Not assigned"}</dd></div></dl>
      <p className="form-help">Hosted uploads require an HTTPS API address. API approval does not activate the Trimble plugin license.</p>
      <div className="enrollment-footer"><Button onClick={close}><Check size={16} />I have saved the key</Button></div>
    </div> : <form onSubmit={e => void submit(e)} className="enrollment-body">
      {action === "create" && <>
        <p className="form-help">Register each Windows or Android installation separately. Find the Trimble device ID in Access → About → Serial number.</p>
        <label>Trimble device ID<input name="identifier" required maxLength={200} autoComplete="off" placeholder="e.g. SAMS-… or your Windows PC ID" /></label>
        <label>Device name / model<input name="model" required maxLength={160} placeholder="e.g. Field tablet 02 / Samsung SM-X236B" /></label>
        <label>Plugin version<input name="pluginVersion" required maxLength={32} defaultValue="0.2.0" /></label>
        <p className="form-help">New registrations start as Pending. Approve the device, then generate its key.</p>
      </>}
      {(action === "create" || action === "receiver") && <label>GNSS receiver (optional)
        <select aria-label="GNSS receiver" value={receiver} onChange={e => setReceiver(e.target.value)} disabled={receivers.isPending || !!receivers.error}>
          <option value="">Assign later / no receiver</option>
          {receivers.data?.map(r => <option key={r.id} value={r.id} disabled={r.controllerId !== null && r.controllerId !== device?.controllerId}>{r.name} · {r.serialNumber}{r.controllerId && r.controllerId !== device?.controllerId ? " (assigned to another controller)" : ""}</option>)}
        </select>
        {receivers.error && <span role="alert">Receiver options could not load. Close and retry.</span>}
        <small>A receiver can belong to one controller at a time. Active survey assignments must end before changing its controller link.</small>
      </label>}
      {action === "approve" && <p className="form-help">Approve this registration for API authentication. Generate a device key after approval to connect the plugin.</p>}
      {action === "revoke" && <div className="enrollment-notice danger"><strong>This stops future API authentication for this registration.</strong><p>All its device keys will be revoked. Registration history and survey data are retained. This action cannot be undone from this screen.</p></div>}
      {action === "key" && <>
        <div className="enrollment-notice"><strong>Generating a key replaces all previous keys for this registration.</strong><p>Update the key on the controller after generation. It will only be displayed once.</p></div>
        <label>Key validity<select name="validDays" defaultValue="90"><option value="30">30 days</option><option value="90">90 days</option><option value="180">180 days</option><option value="365">365 days</option></select></label>
      </>}
      {error && <div role="alert" className="error-box">{error}<p>For a changed record, close this dialog and reopen it after refresh.</p></div>}
      <div className="enrollment-footer"><Button type="button" variant="outline" disabled={busy} onClick={close}>Cancel</Button><Button type="submit" disabled={busy || ((action === "receiver") && (receivers.isPending || !!receivers.error))}>{busy ? "Saving…" : action === "create" ? "Register device" : action === "approve" ? "Approve device" : action === "revoke" ? "Revoke device" : action === "receiver" ? "Save receiver assignment" : "Generate key"}</Button></div>
    </form>}
  </dialog>;
}
