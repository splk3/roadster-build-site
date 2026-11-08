(() => {
  const storageKey = "roadster-theme";
  const environment = window.matchMedia("(prefers-color-scheme: dark)");
  let preference = null;
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored === "light" || stored === "dark") preference = stored;
    else if (stored !== null)
      console.warn("Ignoring invalid saved theme preference");
  } catch (error) {
    console.warn("Theme preference could not be read", error);
  }
  const current = () => preference ?? (environment.matches ? "dark" : "light");
  const apply = () => {
    const theme = current();
    document.documentElement.dataset.theme = theme;
    const button = document.querySelector(".theme-toggle");
    if (button) {
      button.hidden = false;
      button.setAttribute(
        "aria-label",
        `Switch to ${theme === "dark" ? "light" : "dark"} mode`,
      );
    }
  };
  apply();
  environment.addEventListener("change", () => {
    if (preference === null) apply();
  });
  document.addEventListener("DOMContentLoaded", () => {
    apply();
    document.querySelector(".theme-toggle").addEventListener("click", () => {
      preference = current() === "dark" ? "light" : "dark";
      apply();
      try {
        localStorage.setItem(storageKey, preference);
      } catch (error) {
        console.warn(
          "Theme preference could not be saved; using this session's choice",
          error,
        );
      }
    });
  });
})();
