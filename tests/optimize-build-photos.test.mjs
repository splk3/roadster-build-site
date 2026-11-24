import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import {
  cleanDisplayTitle,
  extractExifDate,
  optimizeBuildPhotos,
  optimizeSinglePhoto,
  slugifySegment,
} from "../scripts/optimize-build-photos.mjs";

async function createTestJpeg({ width, height, orientation, seed = 42 }) {
  const channels = 3;
  const raw = new Uint8Array(width * height * channels);
  for (let i = 0; i < raw.length; i += 3) {
    raw[i] = (i * 7 + seed) % 256;
    raw[i + 1] = (i * 13 + seed * 3) % 256;
    raw[i + 2] = (i * 19 + seed * 5) % 256;
  }
  let pipe = sharp(raw, { raw: { width, height, channels } }).jpeg({
    quality: 92,
  });
  if (orientation) {
    pipe = pipe.withMetadata({
      orientation,
      exif: {
        IFD0: {
          DateTime: "2012:07:27 14:30:00",
        },
        IFD2: {
          DateTimeOriginal: "2012:07:26 09:15:42",
        },
      },
    });
  }
  return pipe.toBuffer();
}

test("slugifySegment and cleanDisplayTitle normalize spaces, punctuation, and case", () => {
  assert.equal(
    cleanDisplayTitle("Finished Paint and  Final Assembly "),
    "Finished Paint and Final Assembly",
  );
  assert.equal(
    slugifySegment("Finished Paint and  Final Assembly"),
    "finished-paint-and-final-assembly",
  );
  assert.equal(
    slugifySegment("Body Work, Sheet Metal & Paint"),
    "body-work-sheet-metal-and-paint",
  );
  assert.equal(slugifySegment("Rocco and Ed June _12"), "rocco-and-ed-june-12");
  assert.equal(slugifySegment("   "), "item");
});

test("extractExifDate extracts earliest valid capture timestamp from EXIF buffer", () => {
  const sample = Buffer.from(
    "Exif\0\0...2013:02:10 18:00:00...2012:07:26 09:15:42...",
    "latin1",
  );
  assert.equal(extractExifDate(sample), "2012-07-26T09:15:42");
  assert.equal(extractExifDate(null), null);
});

test("optimizeSinglePhoto auto-rotates EXIF orientation, strips EXIF, enforces max edge, and avoids enlargement", async () => {
  // Stored as 2000x1000 landscape with EXIF orientation 6 (90 deg CW -> upright 1000x2000 portrait)
  const rotatedBuf = await createTestJpeg({
    width: 2000,
    height: 1000,
    orientation: 6,
  });
  const result = await optimizeSinglePhoto(rotatedBuf, {
    format: "webp",
    maxEdge: 1600,
    quality: 80,
    effort: 2,
    thumbEdge: 400,
    thumbQuality: 78,
  });

  assert.equal(result.meta.rotated, true);
  assert.equal(result.meta.originalWidth, 1000);
  assert.equal(result.meta.originalHeight, 2000);
  assert.equal(result.meta.capturedAt, "2012-07-26T09:15:42");
  assert.equal(result.main.width, 800);
  assert.equal(result.main.height, 1600);
  assert.equal(result.thumb.width, 200);
  assert.equal(result.thumb.height, 400);

  const outputMeta = await sharp(result.main.data).metadata();
  assert.equal(outputMeta.format, "webp");
  assert.equal(outputMeta.width, 800);
  assert.equal(outputMeta.height, 1600);
  assert.equal(outputMeta.exif, undefined);
  assert.equal(outputMeta.orientation, undefined);

  // Small image should not be enlarged beyond original dimensions
  const smallBuf = await createTestJpeg({ width: 600, height: 450, seed: 9 });
  const smallResult = await optimizeSinglePhoto(smallBuf, {
    format: "webp",
    maxEdge: 1600,
    thumbEdge: 400,
    effort: 2,
  });
  assert.equal(smallResult.main.width, 600);
  assert.equal(smallResult.main.height, 450);
  assert.equal(smallResult.thumb.width, 400);
  assert.equal(smallResult.thumb.height, 300);
});

test("optimizeBuildPhotos filters non-photos and redundant - small folders, handles collisions, and tracks duplicates/existing matches", async () => {
  const sandbox = await mkdtemp(join(os.tmpdir(), "roadster-opt-test-"));
  try {
    const inputDir = join(sandbox, "input");
    const outputDir = join(sandbox, "output");
    const existingImagesDir = join(sandbox, "existing-images");
    await mkdir(existingImagesDir, { recursive: true });

    const photoA = await createTestJpeg({ width: 1800, height: 1200, seed: 1 });
    const photoB = await createTestJpeg({ width: 1200, height: 900, seed: 2 });
    const photoC = await createTestJpeg({ width: 900, height: 600, seed: 3 });

    const hashA = createHash("sha256")
      .update(photoA)
      .digest("hex")
      .slice(0, 16);
    await writeFile(join(existingImagesDir, `${hashA}-1600.jpg`), "stub");

    // Album with double space, junk, video, and colliding slug filenames ("Shot 1" vs "Shot-1")
    const paintDir = join(inputDir, "Finished Paint and  Final Assembly");
    await mkdir(paintDir, { recursive: true });
    await writeFile(join(paintDir, "Shot 1.JPG"), photoA);
    await writeFile(join(paintDir, "Shot-1.JPG"), photoB);
    await writeFile(join(paintDir, "Thumbs.db"), "windows-thumb-cache");
    await writeFile(join(paintDir, "drive.mp4"), "binary-video");

    // Full folder + "- small" folder with one redundant file and one unique file
    const tankDir = join(inputDir, "Fuel Tank");
    const tankSmallDir = join(inputDir, "Fuel Tank - small");
    await mkdir(tankDir, { recursive: true });
    await mkdir(tankSmallDir, { recursive: true });
    await writeFile(join(tankDir, "DSC0001.JPG"), photoA); // exact duplicate of Shot 1.JPG
    await writeFile(join(tankSmallDir, "DSC0001.JPG"), photoB); // redundant filename -> skipped
    await writeFile(join(tankSmallDir, "UNIQUE.JPG"), photoC); // unique filename -> preserved!

    // Saved webpage + _files directory
    const savedWebDir = join(inputDir, "Driving Video_files");
    await mkdir(savedWebDir, { recursive: true });
    await writeFile(join(inputDir, "Driving Video.htm"), "<html></html>");
    await writeFile(join(savedWebDir, "avatar.jpg"), photoC);

    const manifest = await optimizeBuildPhotos({
      inputDir,
      outputDir,
      existingImagesDir,
      format: "webp",
      maxEdge: 1600,
      quality: 80,
      effort: 2,
      thumbEdge: 400,
      thumbQuality: 78,
      slugify: true,
      skipExisting: false,
      dedupe: false,
      concurrency: 2,
    });

    assert.equal(manifest.summary.processedPhotos, 4);
    assert.equal(manifest.summary.existingSiteMatches, 2);
    assert.equal(manifest.summary.intraDuplicates, 1);

    const outputPaths = manifest.photos.map((photo) => photo.outputPath);
    assert.deepEqual(outputPaths, [
      "finished-paint-and-final-assembly/shot-1-2.webp",
      "finished-paint-and-final-assembly/shot-1.webp",
      "fuel-tank-small/unique.webp",
      "fuel-tank/dsc0001.webp",
    ]);

    for (const photo of manifest.photos) {
      assert(existsSync(join(outputDir, photo.outputPath)));
      assert(existsSync(join(outputDir, photo.thumbPath)));
    }
    assert(existsSync(join(outputDir, "manifest.json")));

    const tankDup = manifest.photos.find(
      (photo) => photo.outputPath === "fuel-tank/dsc0001.webp",
    );
    assert.equal(tankDup.existingSiteHash, hashA);
    assert.equal(
      tankDup.duplicateOf,
      "Finished Paint and  Final Assembly/Shot 1.JPG",
    );

    const skippedReasons = Object.fromEntries(
      manifest.skipped.map((entry) => [entry.sourcePath, entry.reason]),
    );
    assert.equal(
      skippedReasons["Finished Paint and  Final Assembly/Thumbs.db"],
      "os-metadata",
    );
    assert.equal(
      skippedReasons["Finished Paint and  Final Assembly/drive.mp4"],
      "video-excluded",
    );
    assert.equal(
      skippedReasons["Fuel Tank - small/DSC0001.JPG"],
      "redundant-small-folder",
    );
    assert.equal(skippedReasons["Driving Video.htm"], "saved-webpage");
    assert.equal(
      skippedReasons["Driving Video_files/avatar.jpg"],
      "saved-webpage-asset",
    );

    // Re-running with --skip-existing and --dedupe excludes the matches cleanly
    const filteredManifest = await optimizeBuildPhotos({
      inputDir,
      outputDir,
      existingImagesDir,
      format: "jpeg",
      maxEdge: 1600,
      quality: 80,
      thumbEdge: 0,
      slugify: true,
      skipExisting: true,
      dedupe: true,
      concurrency: 2,
    });
    assert.equal(filteredManifest.summary.processedPhotos, 2);
    assert.equal(filteredManifest.summary.thumbOutputBytes, 0);
    const savedManifest = JSON.parse(
      await readFile(join(outputDir, "manifest.json"), "utf8"),
    );
    assert.equal(savedManifest.photos.length, 2);
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});
