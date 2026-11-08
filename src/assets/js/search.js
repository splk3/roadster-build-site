(() => {
  const form = document.querySelector("#search-form");
  if (!form) return;
  document.querySelector("#search-help").hidden = true;
  const query = document.querySelector("#query");
  const status = document.querySelector("#search-status");
  const results = document.querySelector("#search-results");
  let index;
  let request = 0;
  const search = async () => {
    const invocation = ++request;
    const value = query.value.trim();
    results.replaceChildren();
    if (!value) {
      status.textContent = "Enter a search term.";
      return;
    }
    status.textContent = "Searching…";
    try {
      if (!index) {
        const response = await fetch("/search-index.json");
        if (!response.ok)
          throw new Error(`Search index request failed (${response.status})`);
        index = await response.json();
      }
      if (invocation !== request) return;
      const words = value.toLocaleLowerCase().split(/\s+/);
      const matches = index.filter((post) => {
        const text =
          `${post.title} ${post.text} ${post.terms.map((term) => term.title).join(" ")}`.toLocaleLowerCase();
        return words.every((word) => text.includes(word));
      });
      for (const post of matches) {
        const item = document.createElement("li");
        const link = document.createElement("a");
        link.href = post.url;
        link.textContent = post.title;
        item.append(link);
        results.append(item);
      }
      status.textContent = matches.length
        ? `${matches.length} result${matches.length === 1 ? "" : "s"} for “${value}”.`
        : `No results for “${value}”.`;
    } catch (error) {
      if (invocation !== request) return;
      console.error("Archive search unavailable", error);
      status.textContent =
        "Search is unavailable. Please browse the posts or category/tag archives.";
    }
  };
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const url = new URL(window.location.href);
    url.searchParams.set("q", query.value);
    history.replaceState(null, "", url);
    search();
  });
  query.value = new URLSearchParams(window.location.search).get("q") ?? "";
  if (query.value) search();
})();
