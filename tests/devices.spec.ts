import { test, expect } from "@playwright/test";

test("registered Windows and Android devices, search, diagnostics and mobile layout", async ({ page }) => {
  const lifecycleErrors: string[] = [];
  const osmRequests: string[] = [];
  page.on("request", request => {
    if (/openstreetmap\.org|tile\.osm\./i.test(request.url())) osmRequests.push(request.url());
  });
  page.on("console", message => {
    if (message.type() === "error" && message.text().includes("stopped during negotiation")) lifecycleErrors.push(message.text());
  });
  test.skip(!process.env.DEVICE_TEST_PASSWORD, "Requires the locally provisioned API account");
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill(process.env.DEVICE_TEST_USERNAME ?? "demo.admin");
  await page.getByLabel("Password", { exact: true }).fill(process.env.DEVICE_TEST_PASSWORD!);
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page.getByRole("heading", { name: "Your field. In focus." })).toBeVisible();
  await expect(page.locator(".feed-status")).toHaveText("Live updates");
  if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) {
    await expect(page.getByText("Map view is optional", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Fit all rovers" })).toBeDisabled();
  }
  await page.getByRole("link", { name: "Devices & connections" }).click();
  await expect(page.getByRole("heading", { name: "Your connection to the field." })).toBeVisible();
  await expect(page.locator(".device-card")).toHaveCount(2);
  await expect(page.locator("body")).toHaveCSS("font-family", /Mangal/);
  await expect(page.getByLabel("Search devices")).toHaveCSS("font-size", "14px");
  await expect(page.locator(".device-card").filter({ hasText: "LENO-MP2K5JKF" })).toBeVisible();
  const android = page.locator(".device-card").filter({ hasText: "SAMS-AD36-R2YP50S3LN4OI8CX" });
  await android.click();
  await expect(page.locator(".device-id code")).toHaveText("SAMS-AD36-R2YP50S3LN4OI8CX");
  await expect(page.locator(".connection-checklist")).toContainText("No observations received");
  await expect(page.locator(".device-context")).toContainText("license status is not reported by this API");
  await page.getByLabel("Search devices").fill("LENO");
  await expect(page.locator(".device-card")).toHaveCount(1);
  await page.getByLabel("Search devices").fill("no-such-controller");
  await expect(page.getByRole("heading", { name: "No matching devices" })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.locator(".device-card")).toHaveCount(2);
  await page.screenshot({ path: "../../.local/devices-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("Search devices")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("link", { name: "Devices & connections" })).toBeVisible();
  await page.getByRole("button", { name: "Close navigation" }).click();
  await expect.poll(async () => (await page.locator(".sidebar").boundingBox())?.x).toBeLessThanOrEqual(-232);
  await page.screenshot({ path: "../../.local/devices-mobile.png", fullPage: true });
  await page.reload();
  await expect(page.locator(".device-card")).toHaveCount(2);
  expect(lifecycleErrors).toEqual([]);
  expect(osmRequests).toEqual([]);
});
