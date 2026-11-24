import { test, expect } from "@playwright/test";

test("SignalR connects through HTTP polling, refreshes on events and stops on navigation", async ({ page }) => {
  let snapshots = 0, websocketAttempts = 0, deleted = 0, publish = "";
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("websocket", socket => { if (new URL(socket.url()).pathname.includes("/hubs/monitoring")) websocketAttempts++; });
  await page.route("**/api/v1/**", async route => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = {};
    if (path.endsWith("/auth/refresh")) data = { accessToken: "fixture-token" };
    else if (path.endsWith("/auth/me")) data = { userId: "fixture-user", organizationId: "fixture-org", name: "Live feed tester", grants: ["rovers.read", "dashboard.read", "reports.read"].map(permission => ({ permission, scope: "Organization" })) };
    else if (path.endsWith("/rovers")) { snapshots++; data = { items: [], total: 0 }; }
    else if (path.endsWith("/dashboard/district-wise")||path.includes("/land-records/")) data = [];
    else if (path.endsWith("/reports/daily-work")) data = { from: "2026-11-19", to: "2026-11-19", totals: { surveys:0, completed:0, points:0, trackPositions:0, areaM2:0, distanceM:0, users:0, rovers:0 }, users:[], rovers:[], rows:[], totalRows:0, page:1, pageSize:25 };
    else if (path.includes("/land-records/")) data = [];
    else data = { rovers:0, online:0, offline:0, stale:0, workingSurveyors:0, activeJobs:0, points:0, areaM2:0, users:0, activeUsers:0, surveyors:0, completedJobs:0 };
    await route.fulfill({ json: data });
  });
  const connections = new Map<string, { first: boolean; handshake: boolean; replied: boolean }>();
  await page.route("**/hubs/monitoring**", async route => {
    const url = new URL(route.request().url()), method = route.request().method();
    if (url.pathname.endsWith("/negotiate")) {
      const token = `connection-${connections.size + 1}`;
      connections.set(token, { first:true, handshake:false, replied:false });
      return route.fulfill({ json: { negotiateVersion:1, connectionId:token, connectionToken:token,
        availableTransports:[{ transport:"WebSockets",transferFormats:["Text","Binary"] },{ transport:"LongPolling",transferFormats:["Text","Binary"] }] } });
    }
    const connection = connections.get(url.searchParams.get("id") ?? "");
    if (!connection) return route.fulfill({ status:404 });
    if (method === "DELETE") { deleted++; return route.fulfill({ status:202 }); }
    if (method === "POST") { if (route.request().postData()?.includes('"protocol"')) connection.handshake = true; return route.fulfill({ status:200,body:"" }); }
    if (connection.first) { connection.first=false; return route.fulfill({ status:200,body:"" }); }
    for (let i=0; !connection.handshake && i<100; i++) await new Promise(resolve => setTimeout(resolve,10));
    if (!connection.replied) { connection.replied=true; return route.fulfill({ status:200,body:"{}\x1e" }); }
    await new Promise(resolve => setTimeout(resolve,150));
    const body = publish ? JSON.stringify({ type:1, target:publish, arguments:[{ roverId:"test-rover" }] })+"\x1e" : '{"type":6}\x1e';
    publish="";
    await route.fulfill({ status:200,body }).catch(() => { /* A view may abort its final poll on navigation. */ });
  });
  await page.goto("/dashboard");
  await expect(page.locator(".feed-status")).toHaveText("Live updates");
  for (const event of ["RoverPositionUpdated", "MobileTelemetryUpdated", "MobileSurveyUpdated"]) {
    const baseline = snapshots; publish=event;
    await expect.poll(() => snapshots, { timeout:2000 }).toBeGreaterThan(baseline);
  }
  expect(websocketAttempts).toBe(0);
  await page.getByRole("link", { name:"Reports", exact:true }).click();
  await expect(page.getByRole("heading", { name:"Daily work reports." })).toBeVisible();
  await expect.poll(() => deleted).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("an unavailable live hub keeps snapshots available and cancels retry on leaving the page", async ({ page }) => {
  await page.clock.install();
  let negotiations = 0, snapshots = 0;
  await page.route("**/api/v1/**", async route => {
    const path=new URL(route.request().url()).pathname;
    const profile={userId:"fixture",organizationId:"org",name:"Fallback tester",grants:[{permission:"rovers.read",scope:"Organization"},{permission:"dashboard.read",scope:"Organization"}]};
    let data:unknown={rovers:0,online:0,offline:0,stale:0,workingSurveyors:0,activeJobs:0,points:0,areaM2:0};
    if(path.endsWith("/auth/refresh"))data={accessToken:"fixture-token"};
    else if(path.endsWith("/auth/me"))data=profile;
    else if(path.endsWith("/rovers")){snapshots++;data={items:[],total:0};}
    else if(path.endsWith("/district-wise")||path.includes("/land-records/"))data=[];
    await route.fulfill({json:data});
  });
  await page.route("**/hubs/monitoring**", async route => { negotiations++; await route.fulfill({ status:503,body:"Live hub temporarily unavailable" }); });
  await page.goto("/dashboard");
  await expect(page.locator(".feed-status")).toHaveText("Polling · retrying live feed");
  const baseline = snapshots, attempts=negotiations;
  await page.clock.fastForward(16000);
  await expect.poll(() => snapshots).toBeGreaterThan(baseline);
  await expect.poll(() => negotiations).toBeGreaterThan(attempts);
  await page.goto("/login");
  const stopped = negotiations;
  await page.clock.fastForward(60000);
  expect(negotiations).toBe(stopped);
});
