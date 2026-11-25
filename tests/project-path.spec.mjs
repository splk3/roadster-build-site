import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { test, expect } from "@playwright/test";
import { deploymentUrl } from "../scripts/deployment-url.mjs";

const basePath = deploymentUrl().pathname;
const root = resolve("_site");
const types = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};
let server;
let origin;

test.describe("project-path deployment", () => {
  test.skip(basePath === "/", "Requires a project-path SITE_URL build");

  test.beforeAll(async () => {
    server = createServer(async (request, response) => {
      try {
        const url = new URL(request.url, "http://localhost");
        if (!url.pathname.startsWith(basePath)) {
          response.writeHead(404).end("Outside deployment path");
          return;
        }
        let file = resolve(
          root,
          `./${decodeURIComponent(url.pathname.slice(basePath.length))}`,
        );
        if (file !== root && !file.startsWith(`${root}/`)) {
          response.writeHead(400).end("Invalid path");
          return;
        }
        if ((await stat(file)).isDirectory()) file = join(file, "index.html");
        response.writeHead(200, {
          "Content-Type": types[extname(file)] ?? "application/octet-stream",
        });
        response.end(await readFile(file));
      } catch (error) {
        if (error.code !== "ENOENT") {
          console.error(error);
          response.writeHead(500).end("Preview error");
          return;
        }
        response.writeHead(404, { "Content-Type": "text/html" });
        response.end(await readFile(join(root, "404.html")));
      }
    });
    await new Promise((resolveListen) =>
      server.listen(0, "127.0.0.1", resolveListen),
    );
    origin = `http://127.0.0.1:${server.address().port}`;
  });

  test.afterAll(async () => {
    if (server) await new Promise((resolveClose) => server.close(resolveClose));
  });

  test("assets, search, galleries, and legacy links stay under the base path", async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const response = await page.goto(`${origin}${basePath}`);
    expect(response.status()).toBe(200);
    await expect(page.locator('link[rel="stylesheet"]')).toHaveAttribute(
      "href",
      `${basePath}assets/css/site.css`,
    );
    await expect(page.locator(".theme-toggle")).toBeVisible();
    const banner = page.locator(".banner");
    await expect
      .poll(() => banner.evaluate((image) => image.naturalWidth))
      .toBeGreaterThan(0);
    await expect(page.locator(".site-brand")).toHaveAttribute("href", basePath);

    await page.goto(`${origin}${basePath}search/?q=finished%20paint`);
    const result = page.locator("#search-results a").first();
    await expect(result).toHaveAttribute(
      "href",
      `${basePath}posts/finished-paint-and-final-assembly/`,
    );
    await result.click();
    const photo = page.locator(".entry-content img").first();
    await photo.scrollIntoViewIfNeeded();
    await expect
      .poll(() => photo.evaluate((image) => image.naturalWidth))
      .toBeGreaterThan(0);
    expect(await photo.getAttribute("src")).toMatch(
      new RegExp(`^${basePath}assets/images/`),
    );

    await page.goto(`${origin}${basePath}gallery/body-buck/`);
    await page.locator(".gallery-photo-link").first().click();
    await expect(page.locator("#photo-lightbox")).toBeVisible();
    const thumbnail = page.locator(".lightbox-thumb img").first();
    await expect(thumbnail).toHaveAttribute("src", new RegExp(`^${basePath}`));
    await expect
      .poll(() => thumbnail.evaluate((image) => image.naturalWidth))
      .toBeGreaterThan(0);

    await page.goto(
      `${origin}${basePath}2014/03/03/finished-paint-and-final-assembly/#comment-100`,
    );
    await expect(page).toHaveURL(
      `${origin}${basePath}posts/finished-paint-and-final-assembly/#comment-100`,
    );
    const missing = await page.goto(
      `${origin}${basePath}archive/finished-paint-and-final-assembly/`,
    );
    expect(missing.status()).toBe(404);
    await expect(page.locator("#legacy-link")).toHaveAttribute(
      "href",
      `${basePath}posts/finished-paint-and-final-assembly/`,
    );
    expect(errors).toEqual([]);
  });
});
