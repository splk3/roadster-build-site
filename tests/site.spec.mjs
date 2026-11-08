import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("archive navigation, photos, static comments, and missing routes work", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator(".post-summary")).toHaveCount(10);
  await page.getByRole("link", { name: "Older posts →" }).click();
  await expect(page).toHaveURL(/\/page\/2\//);
  await page.getByRole("link", { name: "About", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("About");
  await page.goto("/posts/finished-paint-and-final-assembly/#comment-100");
  await expect(page.locator("#comment-100")).toBeVisible();
  await expect(page.locator("#comments")).toContainText("Comments are closed");
  await expect(page.locator("form[method=post]")).toHaveCount(0);
  const firstImage = page.locator(".entry-content img").first();
  await firstImage.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      firstImage.evaluate((image) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true);
  const imageHref = await firstImage.locator("..").getAttribute("href");
  expect((await page.request.get(imageHref)).status()).toBe(200);
  await page.locator("aside .taxonomy-list a").first().click();
  await expect(page.locator(".post-summary").first()).toBeVisible();
  const response = await page.goto("/not-in-the-archive/");
  expect(response.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "Page not found" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("search has matches, no-result states, safe text, and explicit fetch errors", async ({
  page,
}) => {
  await page.goto("/search/?q=finished%20paint");
  await expect(page.locator("#search-results")).toContainText(
    "Finished Paint and Final Assembly",
  );
  await page.locator("#query").fill("zzzznoarticlezzzz");
  await page
    .locator("#search-form")
    .getByRole("button", { name: "Search" })
    .click();
  await expect(page.locator("#search-status")).toContainText("No results");
  await page.locator("#query").fill("<img src=x onerror=alert(1)>");
  await page
    .locator("#search-form")
    .getByRole("button", { name: "Search" })
    .click();
  await expect(page.locator("#search-status")).toContainText("<img");
  await expect(page.locator("#search-status img")).toHaveCount(0);
  await page.route("**/search-index.json", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.goto("/search/?q=engine");
  await expect(page.locator("#search-status")).toContainText(
    "Search is unavailable",
  );
});

test("content remains usable without JavaScript and honors system dark mode", async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    colorScheme: "dark",
  });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4178/about/");
  await expect(
    page.getByRole("heading", { name: "About", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".theme-toggle")).toBeHidden();
  await page.goto("http://127.0.0.1:4178/search/");
  await expect(page.locator("#search-help")).toContainText(
    "Search requires JavaScript",
  );
  expect(
    await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
  ).toBe("rgb(23, 27, 34)");
  await context.close();
});

for (const theme of ["light", "dark"]) {
  test(`${theme} theme passes accessibility and visual checks`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto("/");
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await expect(page).toHaveScreenshot(`homepage-${theme}.png`);
    await page.goto("/posts/finished-paint-and-final-assembly/#comments");
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.goto("/build-info/");
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}

test("mobile layout has no horizontal overflow and a stable visual baseline", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await expect(page).toHaveScreenshot("homepage-mobile.png");
});
