import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { load } from "cheerio";
import { HtmlValidate } from "html-validate";
import { spamHost } from "./import-wordpress.mjs";
import { loadGalleryData } from "./gallery-data.mjs";
import {
  absoluteUrl,
  deploymentPath,
  deploymentUrl,
  localUrl,
} from "./deployment-url.mjs";

const root = resolve("_site");
const base = deploymentUrl();
const files = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink())
      throw new Error(`Symlink is not a deployable asset: ${path}`);
    if (entry.isDirectory()) await walk(path);
    else files.push(path);
  }
}
await walk(root);
const size = (
  await Promise.all(files.map(async (file) => (await stat(file)).size))
).reduce((a, b) => a + b, 0);
assert(size < 500 * 1024 * 1024, `Site exceeds 500 MiB budget: ${size}`);
const archive = JSON.parse(await readFile("src/_data/archive.json", "utf8"));
assert.equal(archive.posts.length, 44);
assert.equal(archive.pages.length, 3);
assert.equal(
  archive.posts.reduce((count, post) => count + post.comments.length, 0),
  20,
);
const gallery = await loadGalleryData();
assert(gallery.albums.length > 0, "Expected at least one gallery album");
const routes = [
  ...archive.posts.map((entry) => entry.url),
  ...archive.pages.map((entry) => entry.url),
  ...archive.terms.map((entry) => entry.url),
  ...archive.home.map((entry) => entry.url),
  "/gallery/",
  ...gallery.albums.map((album) => album.url),
];
assert.equal(new Set(routes).size, routes.length, "Duplicate routes");
const validator = new HtmlValidate({
  extends: ["html-validate:recommended"],
  rules: {
    "void-style": "off",
    "attribute-boolean-style": "off",
    "attribute-empty-style": "off",
  },
});
const documents = new Map();
for (const file of files.filter((file) => file.endsWith(".html"))) {
  const text = await readFile(file, "utf8");
  const result = await validator.validateString(text, file);
  if (!result.valid) {
    throw new Error(
      `Invalid HTML in ${file}: ${JSON.stringify(result.results[0].messages.slice(0, 8))}`,
    );
  }
  assert(
    !/wp-content|wp-includes|wp-login|xmlrpc|i0\.wp\.com|comment_author_email|comment_author_IP|<form[^>]+method="post"/i.test(
      text,
    ),
    `Legacy/private content leaked into ${file}`,
  );
  const $ = load(text);
  assert.equal($("h1").length, 1, `Expected one main heading: ${file}`);
  const ids = $("[id]")
    .toArray()
    .map((node) => $(node).attr("id"));
  assert.equal(new Set(ids).size, ids.length, `Duplicate IDs: ${file}`);
  const refresh = $('meta[http-equiv="refresh"]').attr("content");
  if (refresh) {
    const match = /url=([^;]+)/i.exec(refresh);
    assert(match, `Invalid refresh redirect in ${file}`);
    assert.equal(
      $('link[rel="canonical"]').attr("href"),
      new URL(match[1].trim(), base).href,
      `Invalid refresh target in ${file}`,
    );
  } else {
    assert.equal(
      $('link[rel="canonical"]').attr("href"),
      absoluteUrl(
        file.endsWith("/index.html")
          ? file.slice(root.length, -10)
          : file.slice(root.length),
        base,
      ),
    );
  }
  documents.set(file, { $, ids: new Set(ids) });
}
const allFiles = new Set(files);
const referencedImages = new Set();
const referencedGalleryAssets = new Set();
for (const [file, { $ }] of documents) {
  const references = [];
  $("[href], [src]").each((_, node) => {
    for (const attribute of ["href", "src"]) {
      const ref = $(node).attr(attribute);
      if (ref) references.push(ref);
    }
  });
  $("[srcset]").each((_, node) => {
    references.push(
      ...$(node)
        .attr("srcset")
        .split(",")
        .map((entry) => entry.trim().split(/\s+/)[0]),
    );
  });
  for (const reference of references) {
    const url = new URL(reference, absoluteUrl(file.slice(root.length), base));
    assert(!spamHost.test(url.hostname), `Spam URL in ${file}`);
    if (url.origin !== base.origin) continue;
    let target = resolve(root, `./${deploymentPath(url, base)}`);
    assert(
      target === root || target.startsWith(`${root}/`),
      `Unsafe target in ${file}`,
    );
    if (url.pathname.endsWith("/")) target = join(target, "index.html");
    assert(allFiles.has(target), `Missing target ${reference} from ${file}`);
    if (url.hash) {
      assert(
        documents.get(target)?.ids.has(decodeURIComponent(url.hash.slice(1))),
        `Missing fragment ${reference} from ${file}`,
      );
    }
    if (target.includes("/assets/images/")) referencedImages.add(target);
    if (target.includes("/assets/gallery/")) {
      referencedGalleryAssets.add(target);
    }
  }
}
for (const file of files.filter((file) => file.includes("/assets/images/"))) {
  assert(referencedImages.has(file), `Unreferenced deployed image ${file}`);
}
for (const file of files.filter((file) => file.includes("/assets/gallery/"))) {
  assert(
    referencedGalleryAssets.has(file),
    `Unreferenced deployed gallery asset ${file}`,
  );
}
for (const route of routes) {
  assert(
    documents.has(join(root, route, "index.html")),
    `Unbuilt route: ${route}`,
  );
}
for (const post of archive.posts) {
  assert(post.legacyUrl, `Missing legacyUrl for post ${post.id}`);
  const redirectFile = join(root, post.legacyUrl, "index.html");
  assert(
    documents.has(redirectFile),
    `Unbuilt legacy redirect: ${post.legacyUrl}`,
  );
  assert.equal(
    documents.get(redirectFile).$('link[rel="canonical"]').attr("href"),
    absoluteUrl(post.url, base),
  );
}
assert.equal(
  (await readFile(join(root, "CNAME"), "utf8")).trim(),
  "roadster.mightypirates.com",
);
const search = JSON.parse(
  await readFile(join(root, "search-index.json"), "utf8"),
);
assert.equal(search.length, 44);
assert(
  search.every((entry) =>
    archive.posts.some((post) => localUrl(post.url, base) === entry.url),
  ),
);
assert(
  (await readFile(join(root, "robots.txt"), "utf8")).includes(
    absoluteUrl("/sitemap.xml", base),
  ),
);
console.log(
  `Validated ${documents.size} HTML pages, ${referencedImages.size} post images, ${referencedGalleryAssets.size} gallery assets (${gallery.albums.length} albums), all links/fragments, 44 search entries; ${(size / 1024 / 1024).toFixed(1)} MiB.`,
);
