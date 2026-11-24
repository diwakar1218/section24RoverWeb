export type NoticeKind = "success" | "warning" | "error";
export type Notice = { id: string; message: string; kind: NoticeKind };
const recent = new Map<string, number>();
let sequence = 0;
export function notify(message: string, kind: NoticeKind = "error", key = message, interval = 4000) {
  if (typeof window === "undefined" || !message.trim()) return;
  const now = Date.now(), previous = recent.get(key);
  if (previous !== undefined && now - previous < interval) return;
  const identical = recent.get(`message:${kind}:${message}`);
  if (identical !== undefined && now - identical < 4000) return;
  recent.set(key, now);
  recent.set(`message:${kind}:${message}`, now);
  for (const [id, time] of recent) if (now - time > 60000) recent.delete(id);
  window.dispatchEvent(new CustomEvent<Notice>("survey-notice", { detail: { id: `${now}_${sequence++}`, message, kind } }));
}
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The action could not be completed. Please try again.";
}
export function dismissNotice(item: Notice) {
  recent.delete(item.message);
  recent.delete(`message:${item.kind}:${item.message}`);
}
