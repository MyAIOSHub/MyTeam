import { test, expect } from "@playwright/test";
import { loginAsDefault } from "./helpers";

test.describe("Comments", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDefault(page);
  });

  test("session page renders the current messaging shell", async ({ page }) => {
    await page.goto("/session");
    await page.waitForURL("**/session");

    await expect(page.getByPlaceholder("搜索会话...")).toBeVisible();
    await expect(page.getByRole("button", { name: "创建频道" })).toBeVisible();
    await expect(page.getByText("选择一个对话")).toBeVisible();
  });

  test("create channel dialog opens from the session sidebar", async ({ page }) => {
    await page.goto("/session");
    await page.waitForURL("**/session");

    await page.getByRole("button", { name: "创建频道" }).click();
    await expect(page.getByRole("heading", { name: "创建频道" })).toBeVisible();
    await expect(page.getByPlaceholder("频道名称")).toBeVisible();
  });
});
