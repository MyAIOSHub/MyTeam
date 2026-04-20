import { test, expect } from "@playwright/test";
import { loginAsDefault } from "./helpers";

test.describe("Settings", () => {
  test("updating workspace name reflects in sidebar immediately", async ({
    page,
  }) => {
    await loginAsDefault(page);

    await page.goto("/settings");
    await page.waitForURL("**/settings");
    await page.getByRole("tab", { name: "通用" }).click();

    const nameInput = page
      .locator('label:has-text("名称")')
      .locator("..")
      .locator("input");
    const originalName = (await nameInput.inputValue()).trim();
    await nameInput.clear();
    const newName = "Renamed WS " + Date.now();
    await nameInput.fill(newName);

    await page.getByRole("button", { name: "保存" }).click();
    await expect(page.getByText("工作区设置已保存").first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-slot="sidebar"]').getByText(newName)).toBeVisible();

    await nameInput.clear();
    await nameInput.fill(originalName);
    await page.getByRole("button", { name: "保存" }).click();
    await expect(page.getByText("工作区设置已保存").first()).toBeVisible({ timeout: 5000 });
  });
});
