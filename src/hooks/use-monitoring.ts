"use client";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HubConnectionBuilder, HttpTransportType, LogLevel } from "@microsoft/signalr";
import { useAuth } from "@/components/providers";
import { API, accessToken, request } from "@/services/api";
import {
  demoRovers,
  demoSummary,
  demoDistricts,
  demoUsers,
  demoSurveys,
} from "@/services/demo";
import type { RoverView, Summary, District, Page, User, Survey } from "@/types";
import {legacyMobileHistory,savedRovers,addSavedSummary,addSavedDistricts} from "@/services/mobile-monitoring";
async function roverSnapshot(districtId: string) {
  const all: RoverView[] = [];
  for (let page = 1; ; page++) {
    const result = await request<Page<RoverView>>(
      `/rovers?page=${page}&pageSize=100${districtId ? `&districtId=${districtId}` : ""}`,
    );
    all.push(...result.items);
    if (all.length >= result.total || !result.items.length) break;
  }
  return all;
}
export function useRovers(districtId = "") {
  const { demo, profile } = useAuth();
  const client=useQueryClient();
  return useQuery({
    queryKey: ["monitoring", "rovers", districtId],
    queryFn: async () => {
      if(demo)return demoRovers().filter(r=>!districtId||r.data.districtId===districtId);
      const [native,history]=await Promise.all([roverSnapshot(districtId),legacyMobileHistory(client,profile)]);
      return history===null?native:[...native,...await savedRovers(client,history.filter(s=>!districtId||s.displayDistrictId===districtId),profile!)];
    },
    enabled: !!profile?.grants.some((g) => g.permission === "rovers.read"),
    refetchInterval: demo ? 8000 : 5000,
  });
}
export function useSummary(districtId = "") {
  const { demo, profile } = useAuth();
  const client=useQueryClient();
  return useQuery({
    queryKey: ["monitoring", "summary", districtId],
    queryFn: async () => {
      if(demo)return demoSummary(districtId);
      const [core,history]=await Promise.all([request<Summary>(`/dashboard/summary${districtId?`?districtId=${districtId}`:""}`),legacyMobileHistory(client,profile)]);
      return history===null?core:addSavedSummary(core,history.filter(s=>!districtId||s.displayDistrictId===districtId));
    },
    enabled: !!profile?.grants.some((g) => g.permission === "dashboard.read"),
    refetchInterval: 5000,
  });
}
export function useDistricts() {
  const { demo, profile } = useAuth();
  const client=useQueryClient();
  return useQuery({
    queryKey: ["monitoring", "districts"],
    queryFn: async () => {
      if(demo)return demoDistricts();
      const [core,history]=await Promise.all([request<District[]>("/dashboard/district-wise"),legacyMobileHistory(client,profile)]);
      return history===null?core:addSavedDistricts(core,history);
    },
    enabled: !!profile?.grants.some((g) => g.permission === "dashboard.read"),
    refetchInterval: 30000,
  });
}
export function useDirectory(
  kind: "users" | "surveys",
  page: number,
  search: string,
) {
  const { demo, profile } = useAuth();
  return useQuery({
    queryKey: ["monitoring", kind, page, search],
    queryFn: async () => {
      if (!demo)
        return request<Page<User | Survey>>(
          `/${kind}?page=${page}&pageSize=10&search=${encodeURIComponent(search)}`,
        );
      const all = (kind === "users" ? demoUsers() : demoSurveys()).filter((x) =>
        JSON.stringify(x).toLowerCase().includes(search.toLowerCase()),
      );
      return {
        items: all.slice((page - 1) * 10, page * 10),
        total: all.length,
        pageNumber: page,
        pageSize: 10,
      };
    },
    enabled: !!profile?.grants.some((g) => g.permission === `${kind}.read`),
  });
}
export function useLive() {
  const { demo, profile } = useAuth(),
    client = useQueryClient(),
    [state, setState] = useState("Connecting");
  useEffect(() => {
    if (demo) {
      setState("Simulated feed");
      return;
    }
    if (!profile?.grants.some((g) => g.permission === "rovers.read")) {
      setState("Unavailable");
      return;
    }
    setState("Connecting");
    let active = true;
    let warned = false;
    // Long polling carries SignalR messages through the hosted IIS/Next proxy.
    // Opt into WebSockets only when the entire proxy path supports upgrades.
    const transport = process.env.NEXT_PUBLIC_SIGNALR_TRANSPORT === "webSockets"
      ? HttpTransportType.WebSockets
      : process.env.NEXT_PUBLIC_SIGNALR_TRANSPORT === "auto"
        ? HttpTransportType.WebSockets | HttpTransportType.LongPolling
        : HttpTransportType.LongPolling;
    const connection = new HubConnectionBuilder()
      .withUrl(`${API}/hubs/monitoring`, { accessTokenFactory: accessToken, transport })
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .configureLogging({
        log(level) {
          // A transport outage is recoverable: the status and scheduled queries
          // expose it to the user without turning it into a Next.js error overlay.
          // Never log the connection URL, which may contain an access token.
          if (active && !warned && level >= LogLevel.Error) {
            warned = true;
            console.warn("Live connection interrupted. Automatic data refresh remains active while reconnecting.");
          }
        },
      })
      .build();
    const snapshot = () => {
      if (active) void client.invalidateQueries({ queryKey: ["monitoring"] });
    };
    [
      "RoverPositionUpdated",
      "RoverStatusChanged",
      "SurveyStarted",
      "SurveyPaused",
      "SurveyCompleted",
      "SurveyPointRecorded",
      "SurveyBoundaryUpdated",
      "DeviceDisconnected",
      "DeviceReconnected",
      "SyncStatusChanged",
      "SurveyStatusChanged",
    ].forEach((event) => connection.on(event, snapshot));
    connection.on("MobileTelemetryUpdated", snapshot);
    connection.on("MobileSurveyUpdated", () => {
      snapshot();
      if (active) {
        void client.invalidateQueries({ queryKey: ["mobile-surveys"] });
        void client.invalidateQueries({ queryKey: ["mobile-survey"] });
        void client.invalidateQueries({ queryKey: ["daily-work"] });
      }
    });
    connection.onreconnecting(() => active && setState("Reconnecting"));
    connection.onreconnected(() => {
      if (active) {
        warned = false;
        setState("Live updates");
        void snapshot();
      }
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const retry = () => {
      if (!active || timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        void start();
      }, 15000);
    };
    connection.onclose(() => {
      if (!active) return;
      setState("Polling · retrying live feed");
      retry();
    });
    const start = async () => {
      if (!active) return;
      try {
        await connection.start();
        if (active) {
          warned = false;
          setState("Live updates");
          void snapshot();
        }
      } catch {
        if (active) {
          setState("Polling · retrying live feed");
          retry();
        }
      }
    };
    // Strict Mode runs setup/cleanup/setup synchronously. Avoid starting the
    // throwaway connection, while still cancelling an in-flight real connection.
    queueMicrotask(() => void start());
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      void connection.stop().catch(() => {
        // This view no longer owns the connection or any UI to update.
      });
    };
  }, [demo, profile, client]);
  return state;
}
