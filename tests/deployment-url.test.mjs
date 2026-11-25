import test from "node:test";
import assert from "node:assert/strict";
import {
  absoluteUrl,
  deploymentPath,
  deploymentUrl,
  localUrl,
} from "../scripts/deployment-url.mjs";

test("deployment URLs support project paths and root domains", () => {
  const project = deploymentUrl("https://example.com/roadster-build-site");
  assert.equal(project.pathname, "/roadster-build-site/");
  assert.equal(localUrl("/", project), "/roadster-build-site/");
  assert.equal(
    localUrl("/assets/image.jpg", project),
    "/roadster-build-site/assets/image.jpg",
  );
  assert.equal(
    localUrl("/roadster-build-site/posts/a/#comment-1", project),
    "/roadster-build-site/posts/a/#comment-1",
  );
  assert.equal(localUrl("#comments", project), "#comments");
  assert.equal(
    localUrl("//external.example/a", project),
    "//external.example/a",
  );
  assert.equal(
    absoluteUrl("/posts/a/", project),
    "https://example.com/roadster-build-site/posts/a/",
  );
  assert.equal(
    absoluteUrl("/posts/a/", deploymentUrl("https://example.com")),
    "https://example.com/posts/a/",
  );
});

test("deployment path validation rejects links outside the configured base", () => {
  const project = deploymentUrl("https://example.com/roadster-build-site/");
  assert.equal(
    deploymentPath(
      new URL("https://example.com/roadster-build-site/"),
      project,
    ),
    "",
  );
  assert.equal(
    deploymentPath(
      new URL("https://example.com/roadster-build-site/posts/a/"),
      project,
    ),
    "posts/a/",
  );
  for (const url of [
    "https://example.com/posts/a/",
    "https://example.com/roadster-build-site-other/",
    "https://other.example/roadster-build-site/",
  ]) {
    assert.throws(
      () => deploymentPath(new URL(url), project),
      /deployment path/,
    );
  }
  assert.equal(
    deploymentPath(
      new URL("https://example.com/posts/a/"),
      deploymentUrl("https://example.com/"),
    ),
    "posts/a/",
  );
});

test("deployment URLs reject unsupported or ambiguous configuration", () => {
  for (const value of [
    "file:///site/",
    "https://user:password@example.com/",
    "https://example.com/?query=1",
    "https://example.com/#fragment",
  ]) {
    assert.throws(() => deploymentUrl(value), /SITE_URL/);
  }
});
