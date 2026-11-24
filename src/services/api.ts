import { withBrowserSessionLock } from "@/lib/browser-session-lock";
export const API = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");
export const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); this.name = "ApiError"; } }
let token: string | null = null, tokenExpiresAt = 0, generation = 0, knownSession = false;
let refreshPromise: Promise<string | null> | null = null;
let channel: BroadcastChannel | undefined;

function sessionChannel() {
  if (!channel && typeof window !== "undefined" && typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel("survey-browser-session");
    channel.onmessage = event => { if (event.data?.type === "signed-out") { setToken(null); window.dispatchEvent(new Event("session-ended")); } };
  }
  return channel;
}
function storeToken(value: string | null, expiresIn = 300) {
  token = value;
  tokenExpiresAt = value ? Date.now() + Math.max(1, expiresIn - 30) * 1000 : 0;
  if (value) {
    knownSession = true;
    try {
      const claims = JSON.parse(atob(value.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      if (typeof claims.exp === "number") tokenExpiresAt = claims.exp * 1000 - 30000;
    } catch { /* Non-JWT fixtures use the API's expiresIn value. */ }
  }
}
export function setToken(value: string | null) { generation++; storeToken(value); if (!value) knownSession = false; sessionChannel(); }
export function broadcastSignOut() { sessionChannel()?.postMessage({ type: "signed-out" }); }
function sessionEnded(expectedGeneration: number) {
  if (generation !== expectedGeneration) return;
  const notify = knownSession;
  setToken(null);
  if (notify && typeof window !== "undefined") { window.dispatchEvent(new Event("session-expired")); broadcastSignOut(); }
}
async function failure(response: Response): Promise<ApiError> {
  const body = await response.json().catch(() => null);
  const fields = body?.errors && typeof body.errors === "object" ? Object.values(body.errors).flat().find(value => typeof value === "string") : undefined;
  const fallback = response.status === 401 ? "Your session is no longer available. Please sign in."
    : response.status === 403 ? "You do not have permission to perform this action."
    : response.status === 409 ? "This record changed. Reload and try again."
    : response.status === 429 ? "Too many attempts. Please try again shortly."
    : response.status >= 500 ? `Service unavailable (${response.status}). Please try again; your session is retained.` : "The request could not be completed.";
  return new ApiError(response.status, fields ?? body?.detail ?? body?.message ?? body?.title ?? fallback);
}
async function refreshLocked(expectedGeneration: number): Promise<string | null> {
  if (expectedGeneration !== generation) return null;
  let response: Response;
  try { response = await fetch(`${API}/api/v1/auth/refresh`, { method: "POST", credentials: "include", cache: "no-store", signal:AbortSignal.timeout(20000) }); }
  catch { throw new ApiError(0, "Cannot reach the server. Check your connection and retry; your session is retained."); }
  if (expectedGeneration !== generation) return null;
  if (response.status === 401) { sessionEnded(expectedGeneration); return null; }
  if (!response.ok) throw await failure(response);
  const result = await response.json();
  if (expectedGeneration !== generation) return null;
  if (typeof result.accessToken !== "string" || !result.accessToken) throw new ApiError(502, "The server returned an invalid session response. Please retry.");
  storeToken(result.accessToken, result.expiresIn);
  return token;
}
export async function refresh(): Promise<string | null> {
  sessionChannel();
  const expectedGeneration = generation;
  // Cookies are shared by tabs. Serialize rotation across the whole browser origin.
  if (!refreshPromise) refreshPromise = withBrowserSessionLock(() => refreshLocked(expectedGeneration)).finally(() => { refreshPromise = null; });
  return refreshPromise;
}
export async function accessToken() { return (token && Date.now() < tokenExpiresAt ? token : await refresh()) ?? ""; }
export async function loginSession(username:string,password:string) {
  return withBrowserSessionLock(async()=>{
    const result=await request<{accessToken:string}>("/auth/login",{method:"POST",body:JSON.stringify({username,password})});
    if(typeof result.accessToken!=="string"||!result.accessToken)throw new ApiError(502,"The server returned an invalid login response. Please try again.");
    setToken(result.accessToken);return result;
  });
}
export async function logoutSession() {
  await accessToken().catch(() => "");
  const logout = async () => {
    try {
      const response = await fetch(`${API}/api/v1/auth/logout`, {method:"POST",credentials:"include",headers:token?{Authorization:`Bearer ${token}`}:{}});
      if (!response.ok && response.status !== 401) throw await failure(response);
    } finally { setToken(null); broadcastSignOut(); }
  };
  return withBrowserSessionLock(logout);
}
export async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const publicRequest = path === "/auth/login";
  let sentToken = token;
  if (!publicRequest && token && Date.now() >= tokenExpiresAt) sentToken = await accessToken();
  const expectedGeneration = generation;
  let response: Response;
  try {
    const headers = new Headers(init.headers);
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    if (!publicRequest && sentToken) headers.set("Authorization", `Bearer ${sentToken}`);
    response = await fetch(`${API}/api/v1${path}`, { ...init, credentials: "include", headers });
  } catch { throw new ApiError(0, "Cannot reach the server. Check your connection and try again."); }
  if (response.status === 401 && retry && !publicRequest && expectedGeneration === generation) {
    // Other requests may already have renewed the token while this response was in flight.
    if ((token && token !== sentToken && Date.now() < tokenExpiresAt) || await refresh()) return request<T>(path, init, false);
  }
  if (response.status === 401 && !retry && !publicRequest) sessionEnded(expectedGeneration);
  if (!response.ok) {
    if(publicRequest&&response.status===401)throw new ApiError(401,"Username or password is incorrect.");
    throw await failure(response);
  }
  return response.status === 204 ? undefined as T : await response.json() as T;
}
