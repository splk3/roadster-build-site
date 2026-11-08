import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { load } from "cheerio";
import { validateWorkflow } from "../scripts/validate-workflows.mjs";

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
