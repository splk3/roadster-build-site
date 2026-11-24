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
  await page.getByRole("button", { name: "Topics" }).click();
  await page.locator("#topics-menu .nav-topic-list a").first().click();
  await expect(page.locator(".post-summary").first()).toBeVisible();
  const response = await page.goto("/not-in-the-archive/");
  expect(response.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "Page not found" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("all posts dropdown, topics dropdown, top search, directories, and lightbox work", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "All Posts" }).click();
  await expect(page.locator("#nav-post-list li")).toHaveCount(44);
  await page.locator("#nav-post-filter").fill("36");
  await expect(page.locator("#nav-post-list li:not([hidden])")).toHaveCount(1);
  await page.locator("#nav-post-list li:not([hidden]) a").click();
  await expect(page).toHaveURL(/\/posts\/first-engine-start\/$/);
  await expect(page.locator(".article-header .build-badge")).toContainText(
    "Post #36 of 44",
  );

  // Lightbox progressive enhancement on post photos
  await page.goto("/posts/finished-paint-and-final-assembly/");
  const photoLink = page
    .locator(".single-post .entry-content a[data-lightbox-index]")
    .first();
  await expect(photoLink).toBeVisible();
  await photoLink.click();
  await expect(page.locator("#photo-lightbox")).toBeVisible();
  await expect(page.locator("#lightbox-counter")).toContainText("Photo 1 of");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#lightbox-counter")).toContainText("Photo 2 of");
  await page.keyboard.press("Escape");
  await expect(page.locator("#photo-lightbox")).toBeHidden();

  // Topics dropdown tab switch & filtering
  await page.getByRole("button", { name: "Topics" }).click();
  await page.getByRole("button", { name: /^Tags \(/ }).click();
  await expect(
    page.locator('[data-topic-section="tags"] .nav-topic-list a').first(),
  ).toBeVisible();
  await page.locator("#nav-topic-filter").fill("wiring");
  await expect(
    page.locator("#topics-menu .nav-topic-list li:not([hidden])").first(),
  ).toBeVisible();

  // Top-bar search submission
  await page.locator("#archive-search").fill("#36");
  await page.locator("#archive-search").press("Enter");
  await expect(page).toHaveURL(/\/search\/\?q=%2336/);
  await expect(page.locator("#search-results")).toContainText(
    "First Engine Start",
  );

  // Dedicated All Posts timeline and Topics directory
  await page.goto("/all-posts/");
  await expect(page.locator(".timeline-item")).toHaveCount(44);
  await page.locator("#timeline-order-toggle").click();
  await expect(page.locator(".timeline-item").first()).toContainText("#44");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page.goto("/topics/");
  await expect(page.locator(".letter-group").first()).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("search has matches, no-result states, safe text, and explicit fetch errors", async ({
  page,
}) => {
  await page.goto("/search/?q=finished%20paint");
  await expect(page.locator("#search-results")).toContainText(
    "Finished Paint and Final Assembly",
  );
  await expect(page.locator("#search-results mark").first()).toBeVisible();
  await expect(
    page.locator("#search-results .search-meta").first(),
  ).toContainText("Posted on");
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

test("legacy date-based URLs redirect to canonical routes and 404 helper still handles unmatched paths", async ({
  page,
}) => {
  await page.goto("/2014/03/03/finished-paint-and-final-assembly/#comment-100");
  await expect(page).toHaveURL(
    /\/posts\/finished-paint-and-final-assembly\/#comment-100$/,
  );
  const response = await page.goto(
    "/archive/finished-paint-and-final-assembly/",
  );
  expect(response.status()).toBe(404);
  await expect(page.locator("#legacy-match")).toBeVisible();
  await expect(page.locator("#legacy-link")).toHaveAttribute(
    "href",
    "/posts/finished-paint-and-final-assembly/",
  );
});

test("legacy WordPress post IDs redirect to the canonical archive route", async ({
  page,
}) => {
  await page.goto("/?p=476");
  await expect(page).toHaveURL(/\/posts\/finished-paint-and-final-assembly\/$/);
});

test("metadata includes favicon, atom feed, open graph, and structured data", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    "href",
    "/assets/images/favicon.svg",
  );
  await expect(page.locator('link[rel="alternate"]')).toHaveAttribute(
    "href",
    "/feed.xml",
  );
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    "Dan and Pat Build a Roadster",
  );
  await page.goto("/posts/finished-paint-and-final-assembly/");
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute(
    "content",
    "article",
  );
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(
    1,
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
  await page.goto("http://127.0.0.1:4178/all-posts/");
  await expect(page.locator(".timeline-item")).toHaveCount(44);
  await page.goto("http://127.0.0.1:4178/gallery/");
  await expect(page.locator(".album-card-item")).toHaveCount(36);
  await page.goto("http://127.0.0.1:4178/gallery/body-buck/");
  await expect(page.locator(".gallery-photo-link")).toHaveCount(20);
  await expect(page.locator(".album-actions")).toBeHidden();
  await page.goto("http://127.0.0.1:4178/search/");
  await expect(page.locator("#search-help")).toContainText(
    "Search requires JavaScript",
  );
  expect(
    await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
  ).toBe("rgb(15, 18, 24)");
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

test("tablet and mobile layouts have no horizontal overflow and accessible top-bar controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  const headerHeight = await page
    .locator(".site-header")
    .evaluate((el) => el.getBoundingClientRect().height);
  expect(headerHeight).toBeLessThanOrEqual(72);

  await expect(page).toHaveScreenshot("homepage-mobile.png");

  // Verify 1-tap search popover and menu popover work on mobile
  await page.getByRole("button", { name: "Search the archive" }).click();
  await expect(page.locator("#archive-search")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.locator(".menu-button").click();
  await expect(page.locator("#site-menu")).toBeVisible();
  await page.getByRole("button", { name: "All Posts" }).click();
  await expect(page.locator("#nav-post-list")).toBeVisible();
});

test("photo gallery albums, lightbox navigation, bidirectional post links, and accessibility work", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/");
  await page.getByRole("link", { name: "Gallery", exact: true }).click();
  await expect(page).toHaveURL(/\/gallery\/$/);
  await expect(page.locator(".album-card-item")).toHaveCount(36);

  // Filter and sort albums
  await page.locator("#gallery-album-filter").fill("engine");
  const filteredCount = await page
    .locator(".album-card-item:not([hidden])")
    .count();
  expect(filteredCount).toBeGreaterThanOrEqual(5);
  await expect(page.locator("#gallery-album-status")).toContainText("Showing");
  await page.locator("#gallery-album-filter").fill("");
  await expect(page.locator(".album-card-item:not([hidden])")).toHaveCount(36);

  await page.locator("#gallery-album-sort").selectOption("count");
  await expect(
    page.locator(".album-card-item").first().locator(".album-card-title"),
  ).toHaveText("Finished Paint and Final Assembly");

  // Open an album page and verify thumbnails + viewer features
  await page.goto("/gallery/body-buck/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Body Buck");
  await expect(page.locator(".gallery-photo-link")).toHaveCount(20);
  const firstThumb = page.locator(".gallery-photo-link img").first();
  await expect
    .poll(() =>
      firstThumb.evaluate((img) => img.complete && img.naturalWidth > 0),
    )
    .toBe(true);

  // Toggle compact grid
  await page.locator("#album-density-toggle").click();
  await expect(page.locator("#album-photo-grid")).toHaveClass(/is-compact/);

  // Lightbox navigation: click, keyboard arrows/End/Home, filmstrip, slideshow, Escape
  await page.locator(".gallery-photo-link").first().click();
  await expect(page.locator("#photo-lightbox")).toBeVisible();
  await expect(page.locator("#lightbox-counter")).toHaveText("Photo 1 of 20");
  await expect(page.locator(".lightbox-thumb")).toHaveCount(20);
  await expect(page).toHaveURL(/#photo-1$/);

  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#lightbox-counter")).toHaveText("Photo 2 of 20");
  await expect(page).toHaveURL(/#photo-2$/);

  await page.keyboard.press("End");
  await expect(page.locator("#lightbox-counter")).toHaveText("Photo 20 of 20");
  await page.keyboard.press("Home");
  await expect(page.locator("#lightbox-counter")).toHaveText("Photo 1 of 20");

  await page.locator(".lightbox-thumb").nth(4).click();
  await expect(page.locator("#lightbox-counter")).toHaveText("Photo 5 of 20");

  await page.locator("#lightbox-slideshow").click();
  await expect(page.locator("#lightbox-slideshow")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator("#lightbox-slideshow").click();
  await expect(page.locator("#lightbox-slideshow")).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  await page.keyboard.press("Escape");
  await expect(page.locator("#photo-lightbox")).toBeHidden();
  await expect(page).toHaveURL(/\/gallery\/body-buck\/$/);

  // Bidirectional links: Album -> Post -> Album
  await page
    .locator(".album-related-posts a", { hasText: "Body Buck Completed" })
    .click();
  await expect(page).toHaveURL(/\/posts\/body-buck-completed\/$/);
  await expect(page.locator(".related-albums")).toBeVisible();
  await page.locator(".related-albums a", { hasText: "Body Buck" }).click();
  await expect(page).toHaveURL(/\/gallery\/body-buck\/$/);

  // Multi-album post callout check
  await page.goto("/posts/finished-paint-and-final-assembly/");
  await expect(page.locator(".related-album-card")).toHaveCount(2);

  // Accessibility checks on gallery & album pages in light and dark themes
  for (const theme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto("/gallery/");
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.goto("/gallery/body-buck/");
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }

  // Mobile zero-overflow check on gallery pages
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/gallery/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.goto("/gallery/body-buck/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();

  expect(errors).toEqual([]);
});
