(() => {
  const form = document.querySelector("#search-form");
  if (!form) return;
  document.querySelector("#search-help").hidden = true;
  const query = document.querySelector("#query");
  const status = document.querySelector("#search-status");
  const results = document.querySelector("#search-results");
  let index;
  let request = 0;
  let debounceTimer;

  const createSnippet = (text, words) => {
    if (!text || !words.length) return null;
    const lowerText = text.toLowerCase();
    let firstIdx = -1;
    for (const word of words) {
      const idx = lowerText.indexOf(word);
      if (idx !== -1 && (firstIdx === -1 || idx < firstIdx)) {
        firstIdx = idx;
      }
    }
    const snippet = document.createElement("p");
    snippet.className = "search-snippet";
    if (firstIdx === -1) {
      snippet.textContent = text.slice(0, 140) + (text.length > 140 ? "…" : "");
      return snippet;
    }
    const start = Math.max(0, firstIdx - 40);
    const end = Math.min(text.length, firstIdx + 120);
    const prefix = start > 0 ? "…" : "";
    const suffix = end < text.length ? "…" : "";
    const rawSlice = text.slice(start, end);

    if (prefix) snippet.append(document.createTextNode(prefix));
    const escapedWords = words
      .filter(Boolean)
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    if (escapedWords.length) {
      const regex = new RegExp(`(${escapedWords.join("|")})`, "gi");
      const parts = rawSlice.split(regex);
      for (const part of parts) {
        if (words.some((w) => w.toLowerCase() === part.toLowerCase())) {
          const mark = document.createElement("mark");
          mark.textContent = part;
          snippet.append(mark);
        } else if (part) {
          snippet.append(document.createTextNode(part));
        }
      }
    } else {
      snippet.append(document.createTextNode(rawSlice));
    }
    if (suffix) snippet.append(document.createTextNode(suffix));
    return snippet;
  };

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
        if (post.dateFormatted) {
          const meta = document.createElement("p");
          meta.className = "search-meta";
          meta.textContent = `Posted on ${post.dateFormatted}`;
          item.append(meta);
        }
        const snippet = createSnippet(post.text, words);
        if (snippet) item.append(snippet);
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
    window.clearTimeout(debounceTimer);
    const url = new URL(window.location.href);
    url.searchParams.set("q", query.value);
    history.replaceState(null, "", url);
    search();
  });

  query.addEventListener("input", () => {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      const url = new URL(window.location.href);
      if (query.value.trim()) url.searchParams.set("q", query.value);
      else url.searchParams.delete("q");
      history.replaceState(null, "", url);
      search();
    }, 250);
  });

  query.value = new URLSearchParams(window.location.search).get("q") ?? "";
  if (query.value) search();
})();
