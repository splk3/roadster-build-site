import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  buildPhotoLabels,
  formatReliableCaptureDate,
  humanizeStem,
  loadGalleryData,
} from "../scripts/gallery-data.mjs";

test("gallery photo label helpers humanize descriptive stems and suppress camera names and bogus dates", () => {
  assert.equal(humanizeStem("basic-buck-complete"), "Basic buck complete");
  assert.equal(humanizeStem("dsc04085"), null);
  assert.equal(humanizeStem("dsc04527-1"), null);
  assert.equal(humanizeStem("p9134808"), null);
  assert.equal(humanizeStem("2011-03-27-15-07-28"), null);
  assert.equal(humanizeStem("20130523-111711"), null);
  assert.equal(humanizeStem("unnamed-2"), null);

  assert.equal(formatReliableCaptureDate("2005-05-26T15:26:30"), null);
  assert.equal(
    formatReliableCaptureDate("2012-07-28T16:45:00"),
    "Jul 28, 2012",
  );

  const descriptive = buildPhotoLabels(
    "Body Buck",
    "final-with-two-shelves",
    5,
    20,
    "2011-03-27T15:08:01",
  );
  assert.equal(descriptive.alt, "Body Buck — Final with two shelves");
  assert.equal(descriptive.caption, "Final with two shelves");
  assert.equal(descriptive.metaText, "Photo 5 of 20 · Mar 27, 2011");

  const camera = buildPhotoLabels(
    "Engine Build",
    "dsc02801",
    12,
    215,
    "2005-06-01T12:00:00",
  );
  assert.equal(camera.alt, "Engine Build — Photo 12 of 215");
  assert.equal(camera.caption, "Engine Build — Photo 12 of 215");
  assert.equal(camera.metaText, "Photo 12 of 215");
});

test("gallery data discovers all 36 flattened albums, verifies files on disk, and enforces bidirectional post links", async () => {
  const gallery = await loadGalleryData();
  const archive = JSON.parse(await readFile("src/_data/archive.json", "utf8"));
  const links = JSON.parse(
    await readFile("src/_data/gallery-links.json", "utf8"),
  );

  assert.equal(gallery.totalAlbums, 36);
  assert.equal(gallery.totalPhotos, 1707);

  const engineBuild = gallery.albums.find(
    (album) => album.slug === "engine-build",
  );
  assert(engineBuild, "Expected engine-build album");
  assert.equal(engineBuild.photoCount, 215);

  const albumSlugs = new Set(gallery.albums.map((album) => album.slug));
  const postUrls = new Set(archive.posts.map((post) => post.url));

  for (const album of gallery.albums) {
    assert(
      !album.slug.includes("/"),
      `Expected single-level album directory, found: ${album.slug}`,
    );
    assert(
      !album.slug.endsWith("thumbs"),
      `Unexpected thumbs album: ${album.slug}`,
    );
    assert(
      album.posts.length > 0,
      `Album ${album.slug} must be linked to at least one build post`,
    );
    assert(album.cover, `Album ${album.slug} missing cover photo`);
    for (const photo of album.photos) {
      assert(
        existsSync(resolve("src", photo.fullUrl.slice(1))),
        `Missing full photo on disk: ${photo.fullUrl}`,
      );
      assert(
        existsSync(resolve("src", photo.thumbUrl.slice(1))),
        `Missing thumbnail on disk: ${photo.thumbUrl}`,
      );
      assert(
        !/\bdsc\d+|\bp\d{6,}\b/i.test(photo.alt),
        `Camera filename leaked in alt: ${photo.alt}`,
      );
    }
  }

  for (const [postUrl, entry] of Object.entries(links.postLinks)) {
    assert(
      postUrls.has(postUrl),
      `Unknown post URL in gallery-links.json: ${postUrl}`,
    );
    assert(
      entry.note && entry.note.trim().length > 15,
      `Missing note for ${postUrl}`,
    );
    assert.equal(
      new Set(entry.albums).size,
      entry.albums.length,
      `Duplicate album slugs for ${postUrl}`,
    );
    for (const slug of entry.albums) {
      assert(
        albumSlugs.has(slug),
        `Unknown album slug "${slug}" referenced by ${postUrl}`,
      );
    }
  }

  // Confirm early pre-build posts intentionally have no gallery links
  const unlinkedPosts = [
    "/posts/roadster-ordered/",
    "/posts/pickup-in-a-few-days/",
    "/posts/build-school-photos-and-videos-posted/",
    "/posts/roadster-picked-up/",
    "/posts/inventory-finished/",
    "/posts/aluminum-panel-day-1/",
    "/posts/engine-ordered/",
  ];
  for (const postUrl of unlinkedPosts) {
    assert.equal(
      gallery.byPostUrl[postUrl],
      undefined,
      `Expected early post ${postUrl} to remain unlinked`,
    );
  }
});
