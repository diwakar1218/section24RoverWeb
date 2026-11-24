import { test, expect, type Page } from "@playwright/test";
import type { MobileSurveyDetail, MobilePoint } from "../src/types/mobile-surveys";

const capturedAt = "2026-11-19T06:30:00Z";
function point(id: string, index: number): MobilePoint {
  return { id, pointNumber: id, name: `Corner ${index + 1}`, latitude: 26.855 + (index > 1 ? .0001 : 0), longitude: 80.93 + (index === 1 || index === 2 ? .0001 : 0), address: `Captured address ${id}`, capturedAt, horizontalAccuracy: .041, verticalAccuracy: .072, fixType: "RTK_FIX" };
}
function survey(points: MobilePoint[], track: MobilePoint[] = []): MobileSurveyDetail {
  return { session: { id: "history-map", project: "Saved field boundary", district: "Lucknow", tehsil: "Lucknow", village: "Park village", gataNo: "1", caseNo: "24", totalArea: 77.42, totalDistance: 36.064, totalPoints: points.length, startedAt: capturedAt, mode: points.length ? "polygon" : "track", status: "completed" }, points, track };
}
async function openSurvey(page: Page, data: MobileSurveyDetail) {
  await page.route("**/api/v1/**", async route => {
    const pathname = new URL(route.request().url()).pathname;
    let json: unknown = [];
    if (pathname.endsWith("/auth/refresh")) json = { accessToken: "fixture" };
    else if (pathname.endsWith("/auth/me")) json = { userId: "reader", organizationId: "org", name: "Survey reader", grants: [{ permission: "surveys.read", scope: "Organization" }] };
    else if (pathname.endsWith("/mobile/survey/history-map")) json = data;
    await route.fulfill({ json });
  });
  await page.goto("/dashboard/mobile-surveys/history-map");
  await expect(page.getByRole("heading", { name: "Saved field boundary." })).toBeVisible();
}

test("history map shows every boundary and track point, point metadata and distance selection", async ({ page }) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const track = [point("T1", 0), point("T2", 2)].map(p => ({ ...p, latitude: p.latitude + .0002, longitude: p.longitude + .0002 }));
  await openSurvey(page, survey([0, 1, 2, 3].map(i => point(`P${i + 1}`, i)), track));
  const map = page.getByRole("region", { name: "Saved survey map", exact: true });
  await expect(map.locator(".survey-map-canvas")).toHaveAttribute("data-rendered", "true", { timeout: 30000 });
  await expect(map.locator(".survey-map-marker")).toHaveCount(6);
  await expect(map.locator(".survey-map-marker.track")).toHaveText(["T1", "T2"]);
  await map.locator('[data-point-id="P2"]').click();
  const info = map.getByRole("region", { name: "Selected map point", exact: true });
  await expect(info).toContainText("Captured address P2");
  await expect(info).toContainText("26.85500000");
  await expect(info).toContainText("80.93010000");
  await info.getByRole("button", { name: "Use as from point", exact: true }).click();
  await map.locator('[data-point-id="P3"]').click();
  await info.getByRole("button", { name: "Use as to point", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "From point", exact: true })).toHaveValue("P2");
  await expect(page.getByRole("combobox", { name: "To point", exact: true })).toHaveValue("P3");
  expect(parseFloat((await page.locator(".survey-distance-result strong").innerText()))).toBeGreaterThan(10);
  expect(parseFloat((await page.locator(".survey-distance-result strong").innerText()))).toBeLessThan(12);
  await map.getByRole("button", { name: "Fit all points", exact: true }).click();
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1100 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  }
  await page.emulateMedia({ media: "print" });
  await expect(map).toBeHidden();
  await expect(page.getByRole("group", { name: "Saved survey point layout", exact: true })).toBeVisible();
  await expect(page.locator(".survey-point-table tbody tr")).toHaveCount(6);
  expect(errors).toEqual([]);
});

test("track-only and single-point history maps remain usable", async ({ page }) => {
  test.setTimeout(60000);
  await openSurvey(page, survey([], [point("T1", 0), point("T2", 2)]));
  await expect(page.locator(".survey-map-marker.track")).toHaveText(["T1", "T2"], { timeout: 30000 });
  await page.locator('[data-point-id="T2"]').click();
  await expect(page.getByRole("region", { name: "Selected map point", exact: true })).toContainText("TRACK POSITION");
  await expect(page.getByRole("region", { name: "Selected map point", exact: true })).toContainText("Captured address T2");
  await page.unroute("**/api/v1/**");
  await openSurvey(page, survey([point("P1", 0)]));
  await expect(page.locator(".survey-map-marker")).toHaveCount(1, { timeout: 30000 });
  await expect(page.locator(".survey-distance-result strong")).toHaveText("0.000 m");
  await expect(page.getByRole("button", { name: "Fit all points", exact: true })).toBeEnabled();
});

test("unavailable map keeps saved coordinates and the printable point diagram accessible", async ({ page }) => {
  await page.route("https://maps.googleapis.com/maps/api/js?**", route => route.abort());
  await openSurvey(page, survey([point("P1", 0), point("P2", 1)]));
  await expect(page.getByRole("region", { name: "Saved survey map", exact: true }).getByRole("alert")).toContainText("Google Maps could not load");
  await expect(page.getByRole("group", { name: "Saved survey point layout", exact: true })).toBeVisible();
  await expect(page.locator(".survey-point-table tbody tr")).toHaveCount(2);
  await page.getByRole("button", { name: "Choose P1 as to point", exact: true }).click();
  await expect(page.locator(".survey-distance-result strong")).toHaveText("0.000 m");
});
