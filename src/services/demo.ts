import type {
  Profile,
  RoverView,
  User,
  Survey,
  Summary,
  District,
} from "@/types";
const org = "10000000-0000-0000-0000-000000000001";
const id = (prefix: string, i: number) =>
  `${prefix}000000-0000-0000-0000-${String(i).padStart(12, "0")}`;
const names = [
  "Aarav Sharma",
  "Priya Verma",
  "Vikram Singh",
  "Ananya Patel",
  "Rohan Mehta",
  "Neha Joshi",
  "Arjun Rao",
  "Kavya Jain",
];
const districts = ["Bhopal", "Sehore", "Raisen", "Vidisha"];
export const demoProfile: Profile = {
  userId: id("20", 1),
  organizationId: org,
  name: "Demo Administrator",
  grants: [
    "dashboard.read",
    "users.read",
    "rovers.read",
    "surveys.read",
    "reports.read",
  ].map((permission) => ({ permission, scope: "Organization" })),
};
export function demoRovers(): RoverView[] {
  const now = Date.now(),
    phase = Math.floor(now / 8000);
  return names.map((name, k) => {
    const i = k + 1,
      status = k < 5 ? "Online" : k === 5 ? "Stale" : "Offline",
      observed = new Date(
        now - (k < 5 ? 5000 : k === 5 ? 120000 : 720000),
      ).toISOString();
    return {
      connectionStatus: status,
      receivingGnss: k < 5,
      activeSurvey: k < 5,
      data: {
        id: id("40", i),
        organizationId: org,
        name: `Rover ${String(i).padStart(2, "0")}`,
        serialNumber: `DEMO-R12-${String(i).padStart(4, "0")}`,
        model: "R12i (simulated)",
        surveyorId: id("21", i),
        surveyorName: name,
        stateId: id("30", 1),
        districtId: id("31", (k % 4) + 1),
        district: districts[k % 4],
        tehsilId: null,
        villageId: null,
        jobId: id("70", i),
        jobName: `Cadastral Survey · Sector ${String(i).padStart(2, "0")}`,
        surveyStatus: k < 5 ? "InProgress" : k === 5 ? "Paused" : "Assigned",
        lastHeartbeat: observed,
        observedAt: observed,
        receivedAt: observed,
        latitude:
          23.2 +
          [0.06, -0.12, 0.17, 0.32, -0.03, -0.17, 0.27, 0.4][k] +
          Math.sin(phase + k) * 0.0003,
        longitude:
          77.4 +
          [0.05, -0.29, 0.34, 0.16, -0.13, -0.35, 0.4, 0.07][k] +
          Math.cos(phase + k) * 0.0003,
        height: 497 + k * 3,
        fixType: k === 2 ? "RtkFloat" : k === 6 ? "None" : "RtkFixed",
        horizontalPrecision: k === 2 ? 0.14 : 0.008 + k * 0.002,
        verticalPrecision: 0.018 + k * 0.003,
        lastSyncAt: observed,
        isDemo: true,
      },
    };
  });
}
export function demoUsers(): User[] {
  return names.map((fullName, k) => ({
    id: id("21", k + 1),
    organizationId: org,
    fullName,
    username: `surveyor${k + 1}.demo`,
    roles: ["Surveyor"],
    stateId: id("30", 1),
    districtId: id("31", (k % 4) + 1),
    district: districts[k % 4],
    tehsilId: null,
    villageId: null,
    isActive: true,
    lastLogin: new Date().toISOString(),
  }));
}
export function demoSurveys(): Survey[] {
  return demoRovers().map((r) => ({
    id: r.data.jobId!,
    organizationId: org,
    name: r.data.jobName!,
    status: r.data.surveyStatus,
    surveyorId: r.data.surveyorId,
    surveyorName: r.data.surveyorName,
    stateId: r.data.stateId,
    districtId: r.data.districtId,
    district: r.data.district,
    tehsilId: null,
    villageId: null,
    pointCount: 0,
    areaM2: 0,
  }));
}
export function demoSummary(districtId: string): Summary {
  const rows = demoRovers().filter(
      (r) => !districtId || r.data.districtId === districtId,
    ),
    surveys = demoSurveys().filter(
      (s) => !districtId || s.districtId === districtId,
    ),
    users = demoUsers().filter(
      (u) => !districtId || u.districtId === districtId,
    );
  return {
    users: users.length,
    activeUsers: users.length,
    surveyors: users.length,
    rovers: rows.length,
    online: rows.filter((r) => r.connectionStatus === "Online").length,
    offline: rows.filter((r) => r.connectionStatus === "Offline").length,
    stale: rows.filter((r) => r.connectionStatus === "Stale").length,
    connectedControllers: rows.filter((r) => r.connectionStatus === "Online")
      .length,
    activeJobs: surveys.filter((s) => s.status === "InProgress").length,
    completedSurveys: 0,
    points: 0,
    areaM2: 0,
    activeSessions: surveys.filter((s) => s.status === "InProgress").length,
    pendingSyncEvents: 0,
    activeDistricts: new Set(
      surveys.filter((s) => s.status === "InProgress").map((s) => s.districtId),
    ).size,
    workingSurveyors: rows.filter((r) => r.activeSurvey).length,
  };
}
export function demoDistricts(): District[] {
  return districts.map((name, k) => {
    const rows = demoSurveys().filter((s) => s.districtId === id("31", k + 1));
    return {
      name,
      districtId: id("31", k + 1),
      total: rows.length,
      completed: 0,
      active: rows.filter((s) => s.status === "InProgress").length,
      points: 0,
      areaM2: 0,
    };
  });
}
