import { expect, test, type Page } from "@playwright/test";

// withDocs() sees the leaf renderer and builds the docs pages with it: leaf/server writes them and
// leaf/dom hydrates them. The same checks run against `farm dev` and the production build.

/** A string every React DOM client build carries. */
const REACT_CLIENT_MARKER = "__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE";

/** Collects the JavaScript the page loads, to check none of it is React. */
function collectScripts(page: Page) {
  const scripts: { url: string; body: Promise<string> }[] = [];
  page.on("response", (response) => {
    if (response.request().resourceType() !== "script") return;
    scripts.push({ url: response.url(), body: response.text().catch(() => "") });
  });
  return async () =>
    Promise.all(scripts.map(async ({ url, body }) => ({ url, body: await body })));
}

/**
 * Opens a folder in the sidebar once the docs listeners are attached. They attach right after
 * hydration, so a click before that changes nothing and is retried.
 */
async function openFolder(page: Page, sidebar: string, name: string) {
  const folder = page.locator(`${sidebar} [data-farm-docs-folder]`).filter({
    has: page.getByRole("button", { name }),
  });
  const button = folder.getByRole("button", { name });
  await expect(async () => {
    if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true", { timeout: 100 });
  }).toPass({ timeout: 15_000 });
  return folder;
}

test("server renders the docs with leaf and hydrates the markup it sent", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const scripts = collectScripts(page);
  // Keep the content element the server sent, from before any script runs.
  await page.addInitScript(() => {
    new MutationObserver((_, observer) => {
      const content = document.querySelector("[data-farm-docs-content]");
      if (!content) return;
      (window as unknown as { __serverContent?: Element }).__serverContent = content;
      observer.disconnect();
    }).observe(document, { childList: true, subtree: true });
  });

  const response = await page.goto("/docs");
  expect(response?.status()).toBe(200);
  const html = await response!.text();
  expect(html).toContain('data-farm-docs-ui="universal"');
  expect(html).toContain('<h1 id="leaf"');
  expect(html).toContain("pnpm add leaf farm-leaf");

  const folder = await openFolder(page, "#nd-sidebar", "Guides");
  await expect(folder.getByRole("link", { name: "Hydration" })).toBeVisible();
  // Hydration adopted the server's content instead of writing it again.
  expect(
    await page.evaluate(
      () =>
        document.querySelector("[data-farm-docs-content]") ===
        (window as unknown as { __serverContent?: Element }).__serverContent,
    ),
  ).toBe(true);
  await expect(page.getByRole("heading", { level: 1, name: "leaf" })).toBeVisible();

  const loaded = await scripts();
  expect(loaded.length).toBeGreaterThan(0);
  expect(loaded.filter(({ body }) => body.includes(REACT_CLIENT_MARKER)).map(({ url }) => url)).toEqual(
    [],
  );
  expect(errors).toEqual([]);
});

test("the theme toggle switches the page and keeps the choice on reload", async ({ page }) => {
  await page.goto("/docs");
  await openFolder(page, "#nd-sidebar", "Guides");
  const root = page.locator("html");
  const next = (await root.getAttribute("class"))?.includes("dark") ? "light" : "dark";
  await page.locator("[data-theme-toggle]").click();
  await expect(root).toHaveClass(new RegExp(`\\b${next}\\b`));
  expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe(next);
  await page.reload();
  await expect(root).toHaveClass(new RegExp(`\\b${next}\\b`));
});

test("links move between docs pages", async ({ page }) => {
  await page.goto("/docs");
  await page.getByRole("navigation", { name: "Page navigation" }).getByRole("link").click();
  await expect(page).toHaveURL(/\/docs\/guides\/hydration$/);
  await expect(page.getByRole("heading", { level: 1, name: "Hydration" })).toBeVisible();
  const pager = page.getByRole("navigation", { name: "Page navigation" });
  await expect(pager.getByRole("link", { name: /leaf/ })).toHaveAttribute("href", "/docs");
  await expect(pager.getByRole("link", { name: /The renderer/ })).toHaveAttribute(
    "href",
    "/docs/guides/renderer",
  );
});

test("the mobile sidebar opens, lists the pages, and closes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/docs/guides/renderer");
  const toggle = page.locator("[data-farm-docs-sidebar-toggle]");
  const sidebar = page.locator("#nd-sidebar-mobile");
  await expect(sidebar).toBeHidden();
  await expect(async () => {
    if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
    await expect(sidebar).toBeVisible({ timeout: 100 });
  }).toPass({ timeout: 15_000 });
  await expect(sidebar.locator('[aria-current="page"]')).toHaveText("The renderer");
  await page.keyboard.press("Escape");
  await expect(sidebar).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
