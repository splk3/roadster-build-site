export default function (eleventy) {
  eleventy.addTransform("trim-template-whitespace", (content) =>
    content.replace(/[ \t]+$/gm, ""),
  );
  eleventy.addPassthroughCopy("src/assets");
  eleventy.addPassthroughCopy("src/CNAME");
  eleventy.addFilter("readableDate", (date) =>
    new Date(`${date.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", {
      dateStyle: "long",
      timeZone: "UTC",
    }),
  );
  eleventy.addFilter("shortDate", (date) =>
    new Date(`${date.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }),
  );
  eleventy.addFilter("monthYear", (date) =>
    new Date(`${date.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }),
  );
  eleventy.addFilter("postNumber", (posts, url) => {
    const index = posts.findIndex((post) => post.url === url);
    return index === -1 ? null : posts.length - index;
  });
  eleventy.addFilter("padNumber", (value) => String(value).padStart(2, "0"));
  eleventy.addFilter("chronological", (posts) => [...posts].reverse());
  eleventy.addFilter("groupByYear", (posts) => {
    const groups = new Map();
    for (const post of posts) {
      const year = post.date.slice(0, 4);
      if (!groups.has(year)) groups.set(year, []);
      groups.get(year).push(post);
    }
    return [...groups.entries()].map(([year, items]) => ({
      year,
      posts: items,
    }));
  });
  eleventy.addFilter("groupTermsByLetter", (terms) => {
    const groups = new Map();
    for (const term of terms) {
      const letter = term.title.trim().charAt(0).toUpperCase() || "#";
      const bucket = /[A-Z]/.test(letter) ? letter : "#";
      if (!groups.has(bucket)) groups.set(bucket, []);
      groups.get(bucket).push(term);
    }
    return [...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([letter, items]) => ({ letter, terms: items }));
  });
  eleventy.addFilter("popularTerms", (terms, limit = 12) =>
    [...terms]
      .sort(
        (left, right) =>
          right.posts.length - left.posts.length ||
          left.title.localeCompare(right.title),
      )
      .slice(0, limit),
  );
  eleventy.addFilter("totalComments", (posts) =>
    posts.reduce((count, post) => count + (post.comments?.length ?? 0), 0),
  );
  eleventy.addFilter(
    "absolute",
    (path) => new URL(path, "https://roadster.mightypirates.com").href,
  );
  eleventy.addFilter("json", (value) => JSON.stringify(value));
  eleventy.addFilter("concat", (left, right) => [...left, ...right]);
  eleventy.addFilter("findPost", (posts, url) =>
    posts.find((post) => post.url === url),
  );
  eleventy.addFilter("firstImage", (html) => {
    if (!html) return null;
    const match = html.match(/src="([^"]+)"/);
    return match ? match[1] : null;
  });
  eleventy.addFilter("xml", (value) =>
    (value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;"),
  );
  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
    htmlTemplateEngine: "njk",
    templateFormats: ["njk"],
  };
}
