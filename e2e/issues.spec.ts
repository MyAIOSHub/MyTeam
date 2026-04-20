import { test, expect } from "@playwright/test";
import {
  createTestApi,
  createE2EIdentity,
  loginWithApi,
} from "./helpers";
import type { TestApiClient } from "./fixtures";

test.describe("Projects", () => {
  let api: TestApiClient;

  test.beforeEach(async ({ page }) => {
    const identity = createE2EIdentity("projects");
    api = await createTestApi(identity);
    await loginWithApi(page, api.getToken()!, api.getWorkspaceId()!);
  });

  test.afterEach(async () => {
    await api.cleanup();
  });

  test("legacy /issues route redirects to /projects", async ({ page }) => {
    await page.goto("/issues");
    await page.waitForURL("**/projects");

    await expect(page.getByRole("button", { name: "创建项目" })).toBeVisible();
    await expect(page.getByText("选择一个项目")).toBeVisible();
  });

  test("can open a project from the list and render inline detail", async ({ page }) => {
    const project = await api.createProject("E2E Project " + Date.now());

    await page.goto("/projects");
    await expect(page.getByText(project.title).first()).toBeVisible({ timeout: 10000 });

    await page.getByText(project.title).first().click();
    await expect(page.getByRole("heading", { name: project.title })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: "批准计划" })).toBeVisible();
  });
});
