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
  eleventy.addFilter(
    "absolute",
    (path) => new URL(path, "https://roadster.mightypirates.com").href,
  );
  eleventy.addFilter("json", (value) => JSON.stringify(value));
  eleventy.addFilter("concat", (left, right) => [...left, ...right]);
  eleventy.addFilter("findPost", (posts, url) =>
    posts.find((post) => post.url === url),
  );
  eleventy.addFilter("xml", (value) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
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
