import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile, readdir, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { load } from "cheerio";
import sanitizeHtml from "sanitize-html";
import sharp from "sharp";
import { autop } from "@wordpress/autop";

export const defaultXml =
  "tmp/danandpatbuildaroadster.WordPress.2026-11-07.xml";
const oldHosts = new Set([
  "roadster.mightypirates.com",
  "www.roadster.mightypirates.com",
]);
export const spamHost =
  /(?:viagra|cialis|pharmacy|sildenafil|tadalafil|paxil)|^canadianped\.com$/i;
const cameraName = /^(?:IMG|DSC|P\d|image|photo)[\d_\s-]*$/i;

export function repairEncoding(text) {
  return text
    .replaceAll("Â\u00a0", " ")
    .replaceAll("â€“", "–")
    .replaceAll("â€”", "—")
    .replaceAll("â€™", "’")
    .replaceAll("â€œ", "“")
    .replaceAll("â€\u009d", "”");
}

export function parseWxr(xml) {
  const valid = XMLValidator.validate(xml);
  if (valid !== true) throw new Error(`Invalid WXR XML: ${valid.err.msg}`);
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new Error("WXR must not contain document types or entities");
  }
  const parsed = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    trimValues: false,
    isArray: (name) =>
      ["item", "category", "wp:comment", "wp:postmeta"].includes(name),
  }).parse(xml);
  if (!parsed.rss?.channel?.item) throw new Error("WXR has no channel items");
  return parsed.rss.channel.item;
}

function value(field) {
  return typeof field === "object" ? (field?.["#text"] ?? "") : (field ?? "");
}

export function scopeRecords(items, expectedSlugs) {
  const records = items.filter(
    (item) =>
      ["post", "page"].includes(item["wp:post_type"]) &&
      item["wp:status"] === "publish",
  );
  const actual = new Set(records.map((item) => item["wp:post_name"]));
  if (actual.size !== records.length)
    throw new Error("Duplicate published slugs");
  if (expectedSlugs) {
    const missing = expectedSlugs.filter((slug) => !actual.has(slug));
    const extra = [...actual].filter((slug) => !expectedSlugs.includes(slug));
    if (missing.length || extra.length) {
      throw new Error(`Scope mismatch: missing [${missing}], extra [${extra}]`);
    }
  }
  return records;
}

function paragraphs(source) {
  return autop(source.replaceAll("<!--more-->", '<span id="more"></span>'));
}

export async function cleanBody(
  source,
  { routeMap, attachmentLinks = new Map(), image, title, edits = [] },
) {
  if (/\[(?:caption|gallery|embed|video|audio)\b/i.test(source)) {
    throw new Error(
      `Unsupported shortcode in ${title}; explicit conversion required`,
    );
  }
  const $ = load(paragraphs(source), null, false);
  $("script, style, form, input, textarea, button, object, embed").each(
    (_, node) => {
      edits.push({ type: "active-markup", detail: node.tagName });
      $(node).remove();
    },
  );
  const visit = (node) => {
    if (node.type === "text") {
      const repaired = repairEncoding(node.data);
      if (repaired !== node.data) {
        edits.push({
          type: "encoding",
          detail: "Repaired verified mojibake in text",
        });
        node.data = repaired;
      }
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit($.root()[0]);
  const textNodes = [];
  const collectText = (node) => {
    if (node.type === "text") textNodes.push(node);
    for (const child of node.children ?? []) collectText(child);
  };
  collectText($.root()[0]);
  for (const node of textNodes) {
    const pattern =
      /https?:\/\/(?:www\.)?roadster\.mightypirates\.com\/wp-content\/uploads\/[^\s<>]+\.(?:jpg|png|gif)/gi;
    const matches = [...node.data.matchAll(pattern)];
    if (!matches.length) continue;
    let replacement = "";
    let offset = 0;
    for (const match of matches) {
      replacement += $("<span>")
        .text(node.data.slice(offset, match.index))
        .html();
      const local = await image(match[0]);
      replacement += `<a href="${local.large}">View build photograph</a>`;
      edits.push({ type: "bare-image-url", detail: local.large });
      offset = match.index + match[0].length;
    }
    replacement += $("<span>").text(node.data.slice(offset)).html();
    $(node).replaceWith(replacement);
  }
  $("#more")
    .slice(1)
    .each((_, node) => {
      $(node).removeAttr("id");
      edits.push({
        type: "duplicate-anchor",
        detail: "Kept the first more anchor; removed duplicate IDs",
      });
    });
  const mappedUrl = (href) => {
    const url = new URL(href, "https://roadster.mightypirates.com");
    if (oldHosts.has(url.hostname)) {
      const path = decodeURIComponent(url.pathname).replace(/\/$/, "") || "/";
      const mapped = routeMap.get(path);
      if (mapped) return mapped + url.hash;
      if (path === "/") return "/" + url.hash;
      if (/wp-|feed|xmlrpc/.test(path)) return null;
      throw new Error(`Unmapped internal link in ${title}: ${url.pathname}`);
    }
    if (!["http:", "https:", "mailto:"].includes(url.protocol)) return null;
    return url.href;
  };
  $("a").each((_, node) => {
    const anchor = $(node);
    const href = anchor.attr("href");
    if (!href) {
      anchor.replaceWith(anchor.contents());
      return;
    }
    let url;
    try {
      url = new URL(href, "https://roadster.mightypirates.com");
    } catch {
      throw new Error(`Invalid URL in ${title}`);
    }
    if (spamHost.test(url.hostname)) {
      edits.push({
        type: "spam",
        detail: `Removed injected text: ${anchor.text()}`,
      });
      anchor.remove();
    } else if (
      url.hostname === "gallery.roadster.mightypirates.com" ||
      /(?:twitter\.com|facebook\.com|x\.com)$/.test(url.hostname) ||
      (/youtube\.com$/.test(url.hostname) &&
        /^\/(?:user|channel|@)/.test(url.pathname))
    ) {
      edits.push({ type: "obsolete-link", detail: anchor.text() });
      anchor.replaceWith(anchor.contents());
    }
  });
  for (const node of $("img").toArray()) {
    const img = $(node);
    const media = await image(img.attr("src"), img.attr("class"));
    img.attr({
      src: media.display,
      srcset: media.srcset,
      sizes: "(max-width: 700px) 100vw, 600px",
      width: String(media.width),
      height: String(media.height),
      loading: "lazy",
      decoding: "async",
    });
    const alt = (img.attr("alt") ?? "").trim();
    if (!alt || cameraName.test(alt)) {
      const context = img.closest("p").text().replace(/\s+/g, " ").trim();
      img.attr(
        "alt",
        `${title}: ${context.slice(0, 140) || "roadster build photograph"}`,
      );
      edits.push({ type: "image-description", detail: media.display });
    }
    if (img.parent().is("a")) img.parent().attr("href", media.large);
  }
  for (const node of $("a").toArray()) {
    const anchor = $(node);
    const href = anchor.attr("href");
    if (!href) continue;
    if (!anchor.text().trim() && !anchor.find("img").length) {
      edits.push({
        type: "empty-anchor",
        detail: "Removed an empty exported attachment anchor",
      });
      anchor.remove();
      continue;
    }
    if (href.startsWith("/assets/")) continue;
    const attachment = attachmentLinks.get(
      new URL(href, "https://roadster.mightypirates.com").pathname.replace(
        /\/$/,
        "",
      ),
    );
    if (/\/wp-content\/uploads\//.test(href) || attachment) {
      anchor.attr("href", (await image(attachment ?? href)).large);
    } else {
      const mapped = mappedUrl(href);
      if (mapped) anchor.attr("href", mapped);
      else {
        edits.push({ type: "unsafe-or-obsolete-link", detail: anchor.text() });
        anchor.replaceWith(anchor.contents());
      }
    }
  }
  $("iframe").each((_, node) => {
    const url = new URL($(node).attr("src"));
    if (!/^(?:www\.)?youtube(?:-nocookie)?\.com$/.test(url.hostname)) {
      throw new Error(`Unapproved iframe in ${title}`);
    }
    $(node).attr("src", `https://www.youtube-nocookie.com${url.pathname}`);
  });
  $("p").each((_, node) => {
    const text = $(node).text().trim();
    const match = /^https?:\/\/youtu\.be\/([\w-]{11})$/.exec(text);
    if (match && !$(node).find("a").length) {
      $(node).html(
        `<a href="https://www.youtube.com/watch?v=${match[1]}">Watch the engine video</a>`,
      );
      edits.push({ type: "video-link", detail: match[1] });
    }
  });
  $("a[target]").removeAttr("target");
  const html = sanitizeHtml($.html(), {
    allowedTags: [
      "p",
      "a",
      "img",
      "ul",
      "ol",
      "li",
      "strong",
      "em",
      "span",
      "br",
      "blockquote",
      "h2",
      "h3",
      "h4",
      "figure",
      "figcaption",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "iframe",
    ],
    allowedAttributes: {
      a: ["href", "title"],
      img: [
        "src",
        "srcset",
        "sizes",
        "alt",
        "width",
        "height",
        "loading",
        "decoding",
      ],
      span: ["id"],
      iframe: ["src", "title", "loading", "allowfullscreen"],
      th: ["scope"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedIframeHostnames: ["www.youtube-nocookie.com"],
    allowProtocolRelative: false,
  });
  return { html, edits };
}

export function approvedComments(item) {
  const comments = (item["wp:comment"] ?? [])
    .filter((comment) => comment["wp:comment_approved"] === "1")
    .map((comment) => ({
      id: Number(comment["wp:comment_id"]),
      parent: Number(comment["wp:comment_parent"]),
      author: repairEncoding(value(comment["wp:comment_author"])).trim(),
      date: comment["wp:comment_date"].replace(" ", "T"),
      source: value(comment["wp:comment_content"]),
    }));
  const ids = new Set(comments.map((comment) => comment.id));
  if (ids.size !== comments.length) throw new Error("Duplicate comment IDs");
  for (const comment of comments) {
    if (comment.parent && !ids.has(comment.parent))
      throw new Error("Orphan comment");
    const seen = new Set([comment.id]);
    let parent = comment.parent;
    while (parent) {
      if (seen.has(parent)) throw new Error("Cyclic comment thread");
      seen.add(parent);
      parent = comments.find((entry) => entry.id === parent).parent;
    }
  }
  return comments;
}

export function repetitionReport(records) {
  const text = (body) => {
    const $ = load(body);
    $("a").each((_, node) => {
      if (spamHost.test($(node).attr("href") ?? "")) $(node).remove();
    });
    return repairEncoding($.text()).replace(/\s+/g, " ").trim();
  };
  const normalized = records.map((record) => ({
    ...record,
    text: text(record.html),
  }));
  const findings = [];
  for (const record of normalized) {
    for (const other of normalized) {
      if (record.id === other.id || other.text.length < 200) continue;
      const at = record.text.indexOf(other.text.slice(0, 200));
      if (at < 0) continue;
      findings.push({
        id: record.id,
        title: record.title,
        copiedFrom: other.id,
        copiedTitle: other.title,
        match: record.text.includes(other.text)
          ? "complete body"
          : "opening passage",
        position: at,
        disposition:
          "Preserved for owner review; no speculative boundary edits",
      });
    }
  }
  return findings;
}

async function mediaPipeline(root, attachments, outputRoot) {
  const directory = join(outputRoot, "src/assets/images");
  await mkdir(directory, { recursive: true });
  const cache = new Map();
  const files = new Set();
  const attachmentById = new Map(
    attachments.map((item) => [item["wp:post_id"], item["wp:attachment_url"]]),
  );
  const localPath = (url) => {
    const parsed = new URL(url, "https://roadster.mightypirates.com");
    const match = decodeURIComponent(parsed.pathname).match(
      /\/wp-content\/uploads\/(.+)/,
    );
    if (!match) throw new Error("Image URL does not map to local uploads");
    const uploads = resolve(root, "wp-content/uploads");
    const path = resolve(uploads, match[1]);
    if (!path.startsWith(`${uploads}/`)) throw new Error("Unsafe media path");
    return path;
  };
  const image = async (url, className = "") => {
    const id = /wp-image-(\d+)/.exec(className)?.[1];
    const original = id ? attachmentById.get(id) : undefined;
    let path = localPath(original ?? url);
    if (!existsSync(path)) {
      const candidates = [
        path.replace(/-\d+x\d+(?=\.\w+$)/, ""),
        path.replace(/_thumb(?=\.\w+$)/, ""),
      ];
      path = candidates.find((candidate) => existsSync(candidate));
      if (!path) throw new Error(`Missing local image: ${url}`);
    }
    if (cache.has(path)) return cache.get(path);
    const input = await readFile(path);
    const hash = createHash("sha256").update(input).digest("hex").slice(0, 16);
    const variants = [];
    for (const width of [400, 900, 1600]) {
      const filename = `${hash}-${width}.jpg`;
      const destination = join(directory, filename);
      const pipeline = sharp(input)
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: 82, mozjpeg: true });
      const { data, info } = await pipeline.toBuffer({
        resolveWithObject: true,
      });
      if (!variants.some((variant) => variant.width === info.width)) {
        await writeFile(destination, data);
        files.add(filename);
        variants.push({
          url: `/assets/images/${filename}`,
          width: info.width,
          height: info.height,
        });
      }
    }
    const display = variants[Math.min(1, variants.length - 1)];
    const result = {
      display: display.url,
      large: variants.at(-1).url,
      srcset: variants
        .map((variant) => `${variant.url} ${variant.width}w`)
        .join(", "),
      width: display.width,
      height: display.height,
    };
    cache.set(path, result);
    return result;
  };
  const prune = async () => {
    for (const filename of await readdir(directory)) {
      if (/^[a-f0-9]{16}-\d+\.jpg$/.test(filename) && !files.has(filename)) {
        await unlink(join(directory, filename));
      }
    }
  };
  return { image, cache, files, prune };
}

async function exportedScope(exportRoot) {
  const { glob } = await import("node:fs/promises");
  const slugs = ["about", "build-info", "tools-and-supplies"];
  for await (const path of glob("20??/??/??/*/index.html", {
    cwd: exportRoot,
  })) {
    slugs.push(path.split("/").at(-2));
  }
  if (slugs.length !== 47)
    throw new Error(`Expected 47 export records, found ${slugs.length}`);
  return slugs;
}

export async function importArchive({
  root = process.cwd(),
  xmlPath = defaultXml,
  exportRoot = root,
} = {}) {
  const xml = await readFile(resolve(root, xmlPath), "utf8");
  const items = parseWxr(xml);
  const records = scopeRecords(items, await exportedScope(exportRoot));
  const attachments = items.filter(
    (item) => item["wp:post_type"] === "attachment",
  );
  const routeMap = new Map();
  for (const item of records) {
    const url =
      item["wp:post_type"] === "post"
        ? `/posts/${item["wp:post_name"]}/`
        : `/${item["wp:post_name"]}/`;
    routeMap.set(new URL(value(item.link)).pathname.replace(/\/$/, ""), url);
  }
  const attachmentLinks = new Map(
    attachments.map((item) => [
      new URL(value(item.link)).pathname.replace(/\/$/, ""),
      item["wp:attachment_url"],
    ]),
  );
  const media = await mediaPipeline(exportRoot, attachments, root);
  const changes = [];
  const archive = { posts: [], pages: [] };
  const taxonomy = { category: new Map(), post_tag: new Map() };
  for (const item of records) {
    const title = repairEncoding(value(item.title)).trim();
    const id = Number(item["wp:post_id"]);
    const type = item["wp:post_type"];
    const url =
      type === "post"
        ? `/posts/${item["wp:post_name"]}/`
        : `/${item["wp:post_name"]}/`;
    const edits = [];
    const { html } = await cleanBody(value(item["content:encoded"]), {
      routeMap,
      attachmentLinks,
      image: media.image,
      title,
      edits,
    });
    const comments = [];
    for (const comment of approvedComments(item)) {
      const cleaned = await cleanBody(comment.source, {
        routeMap,
        attachmentLinks,
        image: media.image,
        title: `${title} comment ${comment.id}`,
        edits,
      });
      comments.push({
        id: comment.id,
        parent: comment.parent,
        author: comment.author,
        date: comment.date,
        html: cleaned.html,
      });
    }
    const $ = load(html);
    const description = $.text().replace(/\s+/g, " ").trim().slice(0, 180);
    const fragment = load(html, null, false);
    let excerpt = "";
    if (html.includes('<span id="more"></span>')) {
      excerpt = load(
        html.split('<span id="more"></span>')[0],
        null,
        false,
      ).html();
    } else {
      excerpt = fragment("p")
        .slice(0, 2)
        .toArray()
        .map((node) => fragment.html(node))
        .join("");
    }
    const entry = {
      id,
      title,
      url,
      date: item["wp:post_date"].slice(0, 10),
      author: value(item["dc:creator"]).trim(),
      html,
      excerpt: excerpt || html,
      description,
      comments,
      categories: [],
      tags: [],
    };
    for (const term of item.category ?? []) {
      const domain = term["@_domain"];
      if (!taxonomy[domain]) continue;
      const slug = term["@_nicename"];
      if (!/^[a-z0-9-]+$/.test(slug))
        throw new Error(`Unsafe taxonomy slug: ${slug}`);
      if (!taxonomy[domain].has(slug))
        taxonomy[domain].set(slug, {
          title: value(term).trim(),
          url: `/${domain === "category" ? "category" : "tag"}/${slug}/`,
          posts: [],
        });
      const group = taxonomy[domain].get(slug);
      if (type === "post") group.posts.push(url);
      entry[domain === "category" ? "categories" : "tags"].push({
        title: group.title,
        url: group.url,
      });
    }
    archive[type === "post" ? "posts" : "pages"].push(entry);
    changes.push({ id, title, edits });
  }
  archive.posts.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  archive.pages.sort((a, b) => a.id - b.id);
  archive.posts.forEach((post, index) => {
    post.newer = archive.posts[index - 1]?.url ?? null;
    post.older = archive.posts[index + 1]?.url ?? null;
  });
  archive.categories = [...taxonomy.category.values()]
    .filter((term) => term.posts.length)
    .sort((a, b) => a.title.localeCompare(b.title));
  archive.tags = [...taxonomy.post_tag.values()]
    .filter((term) => term.posts.length)
    .sort((a, b) => a.title.localeCompare(b.title));
  archive.terms = [...archive.categories, ...archive.tags];
  archive.home = Array.from(
    { length: Math.ceil(archive.posts.length / 10) },
    (_, index) => ({
      url: index ? `/page/${index + 1}/` : "/",
      number: index + 1,
      posts: archive.posts.slice(index * 10, index * 10 + 10),
      previous: index ? (index === 1 ? "/" : `/page/${index}/`) : null,
      next:
        (index + 1) * 10 < archive.posts.length ? `/page/${index + 2}/` : null,
    }),
  );
  archive.banner = await media.image(
    "/wp-content/uploads/2011/04/cropped-IMG_0315.jpg",
  );
  await media.prune();
  archive.sourceHash = createHash("sha256").update(xml).digest("hex");
  const report = {
    source: "WordPress WXR export; raw input remains ignored",
    posts: archive.posts.length,
    pages: archive.pages.length,
    comments: archive.posts.reduce(
      (count, post) => count + post.comments.length,
      0,
    ),
    omittedAttachmentComments: attachments.reduce(
      (count, item) => count + approvedComments(item).length,
      0,
    ),
    images: media.cache.size,
    changes,
    repetitions: repetitionReport([...archive.posts, ...archive.pages]),
    disposition:
      "Ambiguous cross-post content retained for follow-up; confirmed spam and encoding damage cleaned",
  };
  const output = resolve(root, "src/_data");
  await mkdir(output, { recursive: true });
  await mkdir(resolve(root, "docs"), { recursive: true });
  await writeFile(
    join(output, "archive.json"),
    JSON.stringify(archive, null, 2) + "\n",
  );
  await writeFile(
    resolve(root, "docs/migration-report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    `Imported ${report.posts} posts, ${report.pages} pages, ${report.comments} comments, ${report.images} local images; ${report.repetitions.length} repetition findings retained for review.`,
  );
  return { archive, report };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const root = process.cwd();
  const exportRoot = existsSync("wp-content/uploads")
    ? root
    : resolve(root, "tmp/original-export");
  await importArchive({ xmlPath: process.argv[2] ?? defaultXml, exportRoot });
}
