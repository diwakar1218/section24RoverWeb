"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { DEMO, request, refresh, setToken, accessToken, logoutSession, loginSession } from "@/services/api";
import { notify, errorMessage } from "@/lib/notifications";
import { ToastViewport } from "./toast-viewport";
import { demoProfile } from "@/services/demo";
import type { Profile } from "@/types";
type Context = {
  profile: Profile | null; ready: boolean; demo: boolean; sessionError: string;
  retrySession: () => void; signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>; enterDemo: () => void;
};
const Auth = createContext<Context>(null!);
export const useAuth = () => useContext(Auth);
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({
    queryCache: new QueryCache({ onError: (error, query) => {
      if (!query.meta?.silentError) notify(errorMessage(error),"error",`query:${query.queryHash}`,30000);
    }}),
    mutationCache: new MutationCache({
      onError: error => notify(errorMessage(error)),
      onSuccess: (_data,_variables,_context,mutation) => notify(typeof mutation.meta?.successMessage === "string" ? mutation.meta.successMessage : "Changes saved successfully.","success"),
    }),
    defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } },
  }));
  const [profile,setProfile] = useState<Profile|null>(null), [ready,setReady] = useState(false), [demo,setDemo] = useState(false);
  const [sessionError,setSessionError] = useState(""), [attempt,setAttempt] = useState(0);
  const operation = useRef(0), router = useRouter();
  useEffect(() => {
    let active = true, failed = false, running = false;
    const ended = (event:Event) => {
      operation.current++; setToken(null); setProfile(null);setDemo(false);setSessionError("");setReady(true);client.clear();
      if(event.type==="session-expired")notify("Your session is no longer available. Please sign in.","warning");
      router.replace("/login");
    };
    async function restore() {
      if(running)return;running=true;const current=++operation.current;
      try {
        let me:Profile|null=null,preview=false;
        if(DEMO&&sessionStorage.getItem("survey_demo")==="yes"){me=demoProfile;preview=true;}
        else if(await refresh()) me=await request<Profile>("/auth/me");
        if(active&&operation.current===current){setDemo(preview);setProfile(me);setSessionError("");setReady(true);failed=false;}
      } catch(error) {
        if(active&&operation.current===current){failed=true;setSessionError(errorMessage(error));setReady(false);notify(errorMessage(error),"warning","session-restore",30000);}
      } finally {running=false;}
    }
    const retry=()=>{if(failed)void restore();};
    window.addEventListener("session-expired",ended);window.addEventListener("session-ended",ended);window.addEventListener("online",retry);
    const timer=setInterval(retry,15000);void restore();
    return()=>{active=false;clearInterval(timer);window.removeEventListener("session-expired",ended);window.removeEventListener("session-ended",ended);window.removeEventListener("online",retry);};
  },[client,router,attempt]);
  useEffect(()=>{
    if(!profile||demo)return;
    const maintain=()=>{void accessToken().catch(error=>notify(errorMessage(error),"warning","session-connection",30000));};
    const timer=setInterval(maintain,60000);
    window.addEventListener("online",maintain);document.addEventListener("visibilitychange",maintain);
    return()=>{clearInterval(timer);window.removeEventListener("online",maintain);document.removeEventListener("visibilitychange",maintain);};
  },[profile,demo]);
  async function signIn(username:string,password:string) {
    const current=++operation.current;
    await loginSession(username,password);
    if(current!==operation.current)return;
    const me=await request<Profile>("/auth/me");
    if(current!==operation.current)return;
    client.clear();setDemo(false);setProfile(me);setReady(true);setSessionError("");notify("Signed in successfully.","success");router.push("/dashboard");
  }
  async function signOut() {
    operation.current++;
    try {if(!demo)await logoutSession();}
    catch {notify("Signed out of this browser. The server could not be reached.","warning");}
    finally {setToken(null);setProfile(null);setDemo(false);setReady(true);setSessionError("");sessionStorage.removeItem("survey_demo");client.clear();router.replace("/login");}
  }
  function enterDemo(){if(!DEMO)return;operation.current++;sessionStorage.setItem("survey_demo","yes");setDemo(true);setReady(true);setProfile(demoProfile);setSessionError("");router.push("/dashboard");}
  return <QueryClientProvider client={client}><Auth.Provider value={{profile,ready,demo,sessionError,retrySession:()=>setAttempt(n=>n+1),signIn,signOut,enterDemo}}>
    <div className="application-root" onInvalidCapture={event=>{const input=event.target as HTMLInputElement;notify(input.validationMessage||"Please complete the required fields.","warning","form-validation",1500);}}>{children}</div><ToastViewport/>
  </Auth.Provider></QueryClientProvider>;
}
