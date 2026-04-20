import { test, expect } from "@playwright/test";
import { loginAsDefault, openWorkspaceMenu } from "./helpers";

test.describe("Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDefault(page);
  });

  test("sidebar navigation works", async ({ page }) => {
    await page.getByRole("link", { name: "会话" }).click();
    await page.waitForURL("**/session");
    await expect(page.getByPlaceholder("搜索会话...")).toBeVisible();

    await page.getByRole("link", { name: "项目" }).click();
    await page.waitForURL("**/projects");
    await expect(page.getByRole("button", { name: "创建项目" })).toBeVisible();

    await page.getByRole("link", { name: "文件" }).click();
    await page.waitForURL("**/files");
    await expect(page.getByRole("heading", { name: /文件/ })).toBeVisible();

    await page.getByRole("link", { name: "身份" }).click();
    await page.waitForURL("**/account");
    await expect(page.getByRole("heading", { name: "概览", exact: true })).toBeVisible();

    await page.getByRole("link", { name: "设置" }).click();
    await page.waitForURL("**/settings");
    await expect(page.getByRole("heading", { name: "设置" })).toBeVisible();
  });

  test("workspace menu opens current workspace controls", async ({ page }) => {
    await openWorkspaceMenu(page);

    await expect(page.getByText("工作区")).toBeVisible();
    await expect(page.getByText("退出登录")).toBeVisible();
  });

  test("session page can open and close the create channel dialog", async ({ page }) => {
    await page.goto("/session");
    await page.waitForURL("**/session");

    await page.getByRole("button", { name: "创建频道" }).click();
    await expect(page.getByPlaceholder("频道名称")).toBeVisible();
    await page.getByRole("button", { name: "取消" }).click();
    await expect(page.getByPlaceholder("频道名称")).not.toBeVisible();
  });
});
