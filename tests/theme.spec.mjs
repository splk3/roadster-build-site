import { test, expect } from "@playwright/test";

test("system default tracks environment until a persisted manual override", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(
    await page.evaluate(() => localStorage.getItem("roadster-theme")),
  ).toBeNull();
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const toggle = page.getByRole("button", { name: "Switch to dark mode" });
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("link", { name: "About", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(
    await page.evaluate(() => localStorage.getItem("roadster-theme")),
  ).toBe("light");
});

test("saved preference is applied before DOMContentLoaded", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => {
    localStorage.setItem("roadster-theme", "dark");
    document.addEventListener("DOMContentLoaded", () => {
      window.themeAtContentLoaded = document.documentElement.dataset.theme;
    });
  });
  await page.goto("/");
  expect(await page.evaluate(() => window.themeAtContentLoaded)).toBe("dark");
});

test("invalid preferences and denied storage remain usable and produce diagnostics", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() =>
    localStorage.setItem("roadster-theme", "invalid"),
  );
  const warnings = [];
  page.on("console", (message) => {
    if (message.type() === "warning") warnings.push(message.text());
  });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(warnings.some((warning) => warning.includes("invalid"))).toBeTruthy();
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error("Access denied");
    };
    Storage.prototype.setItem = () => {
      throw new Error("Access denied");
    };
  });
  await page.reload();
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(
    warnings.some((warning) => warning.includes("could not be saved")),
  ).toBeTruthy();
});
