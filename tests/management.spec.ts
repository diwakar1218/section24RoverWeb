import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

test("API-backed user governance and draft survey management persist and show validation", async ({
  page,
}) => {
  test.setTimeout(60000);
  test.skip(
    !process.env.DEMO_PASSWORD,
    "Set DEMO_PASSWORD and run the seeded development API",
  );
  const suffix = randomUUID().slice(0, 8),
    username = `browser.${suffix}`,
    fullName = `Browser User ${suffix}`,
    surveyName = `Browser Survey ${suffix}`;
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill("admin.demo");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.DEMO_PASSWORD!);
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(
    page.getByRole("heading", { name: "Your field. In focus." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "People & teams", exact: true }).click();
  await page.getByRole("link", { name: "Add user", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Create user." }),
  ).toBeVisible();
  await page.getByLabel("Full name", { exact: true }).fill(fullName);
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel(/^Initial password/).fill(randomUUID() + "-Temporary!");
  await page.getByRole("checkbox", { name: /Viewer \/ Auditor/ }).check();
  await expect(page.getByLabel("State", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "District", exact: true }).click();
  await page.getByRole("option", { name: "Bhopal", exact: true }).click();
  await page.getByRole("button", { name: "Save user", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: fullName + ".", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Edit user & roles" }).click();
  await page
    .getByLabel("Full name", { exact: true })
    .fill(fullName + " Edited");
  await page.getByRole("button", { name: "Save user", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: fullName + " Edited.", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Deactivate account" }).click();
  await expect(page.locator(".panel-heading .badge")).toHaveText("Inactive");
  await page.getByRole("link", { name: "Survey jobs", exact: true }).click();
  await page
    .getByRole("link", { name: "Create survey job", exact: true })
    .click();
  await page.getByLabel("Survey name", { exact: true }).fill(surveyName);
  await expect(page.getByLabel("State", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "District", exact: true }).click();
  await page.getByRole("option", { name: "Bhopal", exact: true }).click();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: surveyName + ".", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Edit draft", exact: true }).click();
  await page.getByLabel("Priority", { exact: true }).selectOption("High");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.locator(".detail-values")).toContainText("High");
  await page
    .getByLabel("Surveyor", { exact: true })
    .selectOption({ label: "Aarav Sharma" });
  await page
    .getByLabel("GNSS rover", { exact: true })
    .selectOption({ label: "Rover 01 · DEMO-R12-0001" });
  await expect(
    page.getByLabel("Connected controller", { exact: true }),
  ).toHaveValue(/DEMO-TSC-001/);
  await page.getByRole("button", { name: "Assign team", exact: true }).click();
  await expect(page.locator('.error-box[role="alert"]')).toContainText(
    "already assigned to another job",
  );
  await expect(
    page.getByRole("button", { name: "Cancel job", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("Action reason", { exact: true })
    .fill("Completed browser workflow verification");
  await page.getByRole("button", { name: "Cancel job", exact: true }).click();
  await expect(
    page.locator(".detail-grid .panel").first().locator(".badge"),
  ).toHaveText("Cancelled");
  await expect(page.locator(".management-section").last()).toContainText(
    "Completed browser workflow verification",
  );
  await page.screenshot({
    path: "../../.local/survey-workflow.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});
