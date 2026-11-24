import { test, expect } from "@playwright/test";
test("demo dashboard, jurisdiction filter, map details, theme, language, directory, and tablet navigation", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Open demo workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Your field. In focus." }),
  ).toBeVisible();
  await expect(page.getByText("DEMO MODE", { exact: true })).toBeVisible();
  await expect(
    page.locator(".kpi-card").first().locator(".kpi-value"),
  ).toHaveText("8");
  if (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) {
    await expect(page.locator(".map-canvas")).toHaveAttribute("data-rendered", "true", { timeout: 15000 });
  } else {
    await expect(page.getByText("Map view is optional", { exact: true })).toBeVisible();
  }
  await page.screenshot({
    path: "../../.local/dashboard-desktop.png",
    fullPage: true,
  });
  await page
    .getByLabel("District", { exact: true })
    .selectOption({ label: "Bhopal" });
  await expect(
    page.locator(".kpi-card").first().locator(".kpi-value"),
  ).toHaveText("2");
  await expect(page.locator(".field-team .rover-row")).toHaveCount(2);
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await expect(page.locator("html")).toHaveClass("dark");
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await page.getByRole("button", { name: "Switch language" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "आपके क्षेत्र",
  );
  await page.getByRole("button", { name: "Switch language" }).click();
  await page
    .locator(".field-team")
    .getByRole("link", { name: "Rover 01", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Rover 01." })).toBeVisible();
  await expect(
    page.getByText("Simulated device", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "All rovers", exact: true }).click();
  await page
    .locator(".table-toolbar")
    .getByLabel("Search rovers", { exact: true })
    .fill("Rover 03");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("Rover 03");
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your field. In focus." }),
  ).toBeVisible();
  await page.screenshot({
    path: "../../.local/dashboard-tablet.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});
test("API-backed login, live feed, refresh-cookie restoration, and server sign-out", async ({
  page,
}) => {
  test.skip(
    !process.env.DEMO_PASSWORD,
    "Set DEMO_PASSWORD to test the real development seed",
  );
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill("admin.demo");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.DEMO_PASSWORD!);
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(
    page.getByRole("heading", { name: "Your field. In focus." }),
  ).toBeVisible();
  await expect(page.getByText("DEMO MODE", { exact: true })).toHaveCount(0);
  await expect(page.getByText("SIMULATED TELEMETRY", { exact: true })).toBeVisible();
  await expect(
    page.locator(".kpi-card").first().locator(".kpi-value"),
  ).toHaveText("8");
  await expect(page.locator(".feed-status")).toHaveText("Live updates");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your field. In focus." }),
  ).toBeVisible();
  await expect(
    page.locator(".kpi-card").first().locator(".kpi-value"),
  ).toHaveText("8");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
});
