import test from "node:test";
import assert from "node:assert/strict";
import {
  parseWxr,
  scopeRecords,
  cleanBody,
  repairEncoding,
  approvedComments,
  repetitionReport,
} from "../scripts/import-wordpress.mjs";
import { load } from "cheerio";

const image = async () => ({
  display: "/assets/images/example-900.jpg",
  large: "/assets/images/example-1600.jpg",
  srcset:
    "/assets/images/example-900.jpg 900w, /assets/images/example-1600.jpg 1600w",
  width: 900,
  height: 675,
});
const options = {
  image,
  title: "Test article",
  routeMap: new Map([["/2011/01/01/example", "/posts/example/"]]),
};

test("WXR scopes published articles, refuses silent extras, and rejects entities", () => {
  const xml =
    '<rss xmlns:wp="http://wordpress.org/export/1.2/"><channel><item><wp:post_type>post</wp:post_type><wp:status>publish</wp:status><wp:post_name>example</wp:post_name></item><item><wp:post_type>post</wp:post_type><wp:status>draft</wp:status><wp:post_name>draft</wp:post_name></item></channel></rss>';
  assert.equal(scopeRecords(parseWxr(xml), ["example"]).length, 1);
  assert.throws(
    () => scopeRecords(parseWxr(xml), ["another"]),
    /Scope mismatch/,
  );
  assert.throws(() => parseWxr("<rss>"), /Invalid WXR/);
  assert.throws(
    () => parseWxr('<!DOCTYPE rss [<!ENTITY x "value">]><rss/>'),
    /entities/,
  );
});

test("cleanup repairs only known mojibake, removes injected words, and preserves real prose", async () => {
  const { html } = await cleanBody(
    'Hello.Â\u00a0 <a href="https://buy-viagra.example">nonsense</a>World – already valid. <a href="https://uspaxil.com">injected term</a> <a href="https://canadianped.com">injected word</a>\n\nNext â€“ paragraph.',
    options,
  );
  assert(!html.includes("nonsense"));
  assert(!html.includes("injected"));
  assert(!html.includes("Â"));
  assert(html.includes("World – already valid."));
  assert(html.includes("Next – paragraph."));
  assert.equal(
    repairEncoding("São Paulo – Â is a letter"),
    "São Paulo – Â is a letter",
  );
});

test("internal links and attachment photos become local, responsive references", async () => {
  const { html } = await cleanBody(
    '<a href="http://www.roadster.mightypirates.com/2011/01/01/example/#more">Read</a>\n\n<a href="/missing-attachment/"><img src="https://i0.wp.com/example/photo.jpg" alt="" onerror="alert(1)"></a>',
    options,
  );
  assert(html.includes('href="/posts/example/#more"'));
  assert(html.includes('href="/assets/images/example-1600.jpg"'));
  assert(html.includes("900w"));
  assert(!html.includes("onerror"));
  assert(!html.includes("i0.wp.com"));
  await assert.rejects(
    cleanBody('<a href="/missing/">Read</a>', options),
    /Unmapped internal link/,
  );
});

test("cleanup removes unsafe markup and obsolete links but keeps useful video/resource links", async () => {
  const { html } = await cleanBody(
    '<p><script>alert(1)</script><a href="javascript:alert(1)">Unsafe</a><a href="https://gallery.roadster.mightypirates.com/">Gallery</a><a href="https://www.youtube.com/user/example">Channel</a><a href="https://www.youtube.com/watch?v=4TQGS8QAohM">Video</a><a href="https://www.factoryfive.com/">Parts</a></p>',
    options,
  );
  assert(!html.includes("<script"));
  assert(!html.includes("javascript:"));
  assert(!html.includes("gallery.roadster"));
  assert(!html.includes("/user/"));
  assert(html.includes("watch?v="));
  assert(html.includes("factoryfive.com"));
  await assert.rejects(
    cleanBody("[gallery ids='1']", options),
    /Unsupported shortcode/,
  );
});

test("repeated more markers become one usable anchor without dropping text", async () => {
  const { html } = await cleanBody(
    "Before<!--more-->After\n\nCopied<!--more-->Tail",
    options,
  );
  assert.equal((html.match(/id="more"/g) ?? []).length, 1);
  assert(html.includes("Tail"));
});

test("mixed existing HTML and WordPress text keep paragraph and list boundaries", async () => {
  const { html } = await cleanBody(
    "First paragraph.\n\n<p>Existing paragraph.</p>\n\nLast paragraph.\n\n<ul><li>A part</li><li>Another part</li></ul>",
    options,
  );
  const $ = load(html);
  assert.deepEqual(
    $("p")
      .toArray()
      .map((node) => $(node).text().trim()),
    ["First paragraph.", "Existing paragraph.", "Last paragraph."],
  );
  assert.equal($("li").length, 2);
});

test("approved comments exclude private fields and validate their thread", () => {
  const item = {
    "wp:comment": [
      {
        "wp:comment_id": "1",
        "wp:comment_parent": "0",
        "wp:comment_approved": "1",
        "wp:comment_author": "Example",
        "wp:comment_author_email": "not-for-publication@example.invalid",
        "wp:comment_author_IP": "192.0.2.1",
        "wp:comment_date": "2011-01-01 12:00:00",
        "wp:comment_content": "Good build",
      },
      {
        "wp:comment_id": "2",
        "wp:comment_parent": "1",
        "wp:comment_approved": "0",
      },
    ],
  };
  const comments = approvedComments(item);
  assert.equal(comments.length, 1);
  assert.equal(comments[0].date, "2011-01-01T12:00:00");
  assert(!JSON.stringify(comments).includes("not-for-publication"));
  assert(!JSON.stringify(comments).includes("192.0.2.1"));
  item["wp:comment"][0]["wp:comment_parent"] = "99";
  assert.throws(() => approvedComments(item), /Orphan/);
  item["wp:comment"][0]["wp:comment_parent"] = "1";
  assert.throws(() => approvedComments(item), /Cyclic/);
});

test("cross-post detection reports complete and partial matches without changing bodies", () => {
  const body = "Genuine build content. ".repeat(20);
  const records = [
    { id: 1, title: "Original", html: `<p>${body}</p>` },
    { id: 2, title: "Copy", html: `<p>${body} Additional prose.</p>` },
    {
      id: 3,
      title: "Partial",
      html: `<p>${body.slice(0, 250)} Other text.</p>`,
    },
  ];
  const before = JSON.stringify(records);
  const findings = repetitionReport(records);
  assert(
    findings.some(
      (finding) =>
        finding.id === 2 &&
        finding.copiedFrom === 1 &&
        finding.match === "complete body",
    ),
  );
  assert(
    findings.some(
      (finding) =>
        finding.id === 3 &&
        finding.copiedFrom === 1 &&
        finding.match === "opening passage",
    ),
  );
  assert.equal(JSON.stringify(records), before);
});
