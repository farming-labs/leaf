import { expect, test, type Page } from "@playwright/test";

// The two ways to use ui-sdk from leaf: its primitive under a leaf component, and its web
// component written as a plain tag.

async function gotoHydrated(page: Page, path: string) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(path);
  await expect(page.locator(".shell")).toHaveAttribute("data-hydrated", "true");
  return errors;
}

test("the primitive writes aria-pressed into the server HTML", async ({ request }) => {
  const response = await request.get("/ui");
  expect(response.status()).toBe(200);
  expect(await response.text()).toMatch(/<button[^>]*\baria-pressed="true"[^>]*>Bold<\/button>/);
});

test("a leaf toggle on the ui-sdk primitive toggles by click and keyboard", async ({ page }) => {
  const errors = await gotoHydrated(page, "/ui");
  const bold = page.getByRole("button", { name: "Bold" });
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await bold.click();
  await expect(bold).toHaveAttribute("aria-pressed", "false");
  await bold.press("Space");
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await bold.press("Enter");
  await expect(bold).toHaveAttribute("aria-pressed", "false");
  expect(errors).toEqual([]);
});

test("the ui-sdk web component upgrades in the browser and toggles", async ({ page }) => {
  const errors = await gotoHydrated(page, "/ui/web");
  await expect
    .poll(() => page.evaluate(() => customElements.get("ui-toggle") !== undefined))
    .toBe(true);
  const bold = page.getByRole("button", { name: "Bold" });
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await bold.click();
  await expect(bold).toHaveAttribute("aria-pressed", "false");
  expect(errors).toEqual([]);
});
