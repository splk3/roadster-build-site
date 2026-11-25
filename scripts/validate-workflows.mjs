import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseDocument } from "yaml";

export function validateWorkflow(source) {
  const document = parseDocument(source);
  assert.equal(document.errors.length, 0, "Invalid workflow YAML");
  const workflow = document.toJS();
  assert(
    !Object.hasOwn(workflow.on ?? {}, "pull_request_target"),
    "Unsafe PR trigger",
  );
  assert.equal(
    workflow.permissions?.contents,
    "read",
    "Workflow must default to read-only contents",
  );
  const uses = source
    .split("\n")
    .filter((line) => /^\s*(?:-\s*)?uses:/.test(line));
  for (const line of uses) {
    const match = /uses:\s+([^\s#]+)(?:\s+#\s*(v\d+\.\d+\.\d+))?/.exec(line);
    assert(match, "Invalid action reference");
    if (match[1].startsWith("./")) continue;
    assert(
      /^[\w.-]+\/[\w./-]+@[a-f0-9]{40}$/.test(match[1]),
      `Action must use a full SHA: ${line}`,
    );
    assert(match[2], `Missing exact release comment: ${line}`);
  }
  for (const [name, job] of Object.entries(workflow.jobs ?? {})) {
    if (
      job.permissions?.pages === "write" ||
      job.permissions?.["id-token"] === "write"
    ) {
      assert.equal(
        name,
        "deploy",
        "Deploy credentials only belong in the deploy job",
      );
      assert.equal(job.environment?.name, "github-pages");
      assert(job.needs, "Deploy must depend on validation gates");
      assert(
        job.if?.includes("refs/heads/main"),
        "Deploy must restrict the branch",
      );
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  for (const file of await readdir(".github/workflows")) {
    if (/\.ya?ml$/.test(file))
      validateWorkflow(await readFile(`.github/workflows/${file}`, "utf8"));
  }
  console.log(
    "Validated SHA/tag pinning, PR triggers, and deployment permissions.",
  );
}
