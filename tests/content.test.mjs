import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { load } from "cheerio";
import { validateWorkflow } from "../scripts/validate-workflows.mjs";
import { cameraName, repetitionReport } from "../scripts/import-wordpress.mjs";

test("archive preserves scoped records and recovered comments without WordPress/private dependencies", async () => {
  const archive = JSON.parse(await readFile("src/_data/archive.json", "utf8"));
  assert.equal(archive.posts.length, 44);
  assert.equal(archive.pages.length, 3);
  assert.equal(
    archive.posts.reduce((count, post) => count + post.comments.length, 0),
    20,
  );
  assert.equal(
    new Set([...archive.posts, ...archive.pages].map((entry) => entry.id)).size,
    47,
  );
  assert.equal(archive.posts[0].title, "Finished Paint and Final Assembly");
  assert.equal(archive.posts[0].comments[0].id, 100);
  for (const entry of [...archive.posts, ...archive.pages]) {
    const $ = load(entry.html);
    assert($.text().trim().length > 100);
    assert(!$("script, form").length);
    assert(!entry.html.includes("wp-content"));
    assert(!entry.html.includes("i0.wp.com"));
    for (const comment of entry.comments) {
      assert.deepEqual(Object.keys(comment).sort(), [
        "author",
        "date",
        "html",
        "id",
        "parent",
      ]);
    }
  }
  assert.deepEqual(
    archive.home.map((page) => page.posts.length),
    [10, 10, 10, 10, 4],
  );
  assert(
    archive.terms.every((term) =>
      term.posts.every((url) => archive.posts.some((post) => post.url === url)),
    ),
  );
  assert.equal(
    repetitionReport([...archive.posts, ...archive.pages]).length,
    0,
    "Archive should have zero cross-post duplicate findings",
  );
  for (const post of archive.posts) {
    assert.match(post.legacyUrl, /^\/\d{4}\/\d{2}\/\d{2}\/[a-z0-9-]+\/$/);
  }
  for (const entry of [...archive.posts, ...archive.pages]) {
    assert(!entry.html.includes("rdsterhome.html"));
    assert(!entry.html.includes("mcc.edu/factoryfive"));
    assert(
      !/More (?:pictures|photos)[^<]{0,40}in the (?:photo )?Gallery/i.test(
        entry.html,
      ),
      `Obsolete gallery boilerplate remained in ${entry.title}`,
    );
    const $ = load(entry.html);
    $("img").each((_, node) => {
      const alt = $(node).attr("alt");
      assert.notEqual(
        alt,
        undefined,
        `Missing alt attribute in ${entry.title}`,
      );
      if (alt) {
        assert(
          !cameraName.test(alt),
          `Camera/timestamp alt leaked in ${entry.title}: ${alt}`,
        );
        assert(
          !alt.startsWith(`${entry.title}:`),
          `Paragraph-dump fallback alt leaked in ${entry.title}: ${alt}`,
        );
      }
    });
  }
});

test("workflow policy rejects floating pins, wrong comments, unsafe triggers, and ungated deploys", () => {
  const valid = `on:\n  pull_request:\npermissions:\n  contents: read\njobs:\n  test:\n    steps:\n      - uses: actions/checkout@${"a".repeat(40)} # v7.0.1\n`;
  validateWorkflow(valid);
  assert.throws(
    () => validateWorkflow(valid.replace("a".repeat(40), "v7")),
    /full SHA/,
  );
  assert.throws(
    () => validateWorkflow(valid.replace(" # v7.0.1", "")),
    /release comment/,
  );
  assert.throws(
    () =>
      validateWorkflow(valid.replace("pull_request:", "pull_request_target:")),
    /Unsafe/,
  );
  assert.throws(
    () => validateWorkflow(valid.replace("contents: read", "contents: write")),
    /read-only/,
  );
  const deploy = `on:\n  push:\npermissions:\n  contents: read\njobs:\n  deploy:\n    permissions:\n      pages: write\n    environment:\n      name: github-pages\n    if: github.ref == 'refs/heads/main'\n`;
  assert.throws(() => validateWorkflow(deploy), /validation gates/);
});
