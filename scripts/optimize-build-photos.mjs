import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import {
  basename,
  dirname,
  extname,
  join,
  posix,
  relative,
  resolve,
  sep,
} from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import sharp from "sharp";

export const defaultInputDir = "tmp/Roadster Build Photos";
export const defaultOutputDir = "tmp/roadster-build-photos-optimized";
export const defaultExistingImagesDir = "src/assets/images";

const supportedImageExts = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".tif",
  ".tiff",
]);
const videoExts = new Set([".mp4", ".mpg", ".mpeg", ".mov", ".avi", ".wmv"]);
const osMetadataNames = new Set(["thumbs.db", ".ds_store", "desktop.ini"]);

export function toPosixPath(filePath) {
  return filePath.split(sep).join(posix.sep);
}

export function cleanDisplayTitle(name) {
  return String(name ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

export function slugifySegment(name) {
  const slug = cleanDisplayTitle(name)
    .replaceAll("&", " and ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "item";
}

export function extractExifDate(exifBuffer) {
  if (!exifBuffer || !exifBuffer.length) return null;
  const text = Buffer.from(exifBuffer).toString("latin1");
  const matches = [
    ...text.matchAll(
      /\b((?:19|20)\d{2}):(\d{2}):(\d{2}) (\d{2}:\d{2}:\d{2})\b/g,
    ),
  ];
  if (!matches.length) return null;
  const formatted = matches.map(
    ([, year, month, day, time]) => `${year}-${month}-${day}T${time}`,
  );
  // EXIF stores ModifyDate first and DateTimeOriginal/CreateDate later; pick the earliest valid capture date.
  formatted.sort();
  return formatted[0];
}

export async function loadExistingSiteHashes(
  imagesDir = defaultExistingImagesDir,
) {
  const hashes = new Set();
  if (!imagesDir || !existsSync(imagesDir)) return hashes;
  for (const name of await readdir(imagesDir)) {
    const match = /^([a-f0-9]{16})-\d+\.[a-z0-9]+$/i.exec(name);
    if (match) hashes.add(match[1].toLowerCase());
  }
  return hashes;
}

async function listJpgBasenames(dirPath) {
  const names = new Set();
  if (!existsSync(dirPath)) return names;
  for (const entry of await readdir(dirPath, { withFileTypes: true })) {
    if (entry.isFile() && /\.jpe?g$/i.test(entry.name)) {
      names.add(entry.name.toLowerCase());
    }
  }
  return names;
}

export async function collectInputFiles(inputRoot) {
  const resolvedRoot = resolve(inputRoot);
  const photos = [];
  const skipped = [];

  async function walk(currentDir, inheritedSkipReason = null) {
    const entries = await readdir(currentDir, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      const relPath = toPosixPath(relative(resolvedRoot, fullPath));

      if (entry.isSymbolicLink()) {
        skipped.push({
          sourcePath: relPath,
          reason: "symlink-excluded",
          bytes: 0,
        });
        continue;
      }

      if (entry.isDirectory()) {
        if (inheritedSkipReason) {
          await walk(fullPath, inheritedSkipReason);
          continue;
        }
        if (/_files$/i.test(entry.name)) {
          await walk(fullPath, "saved-webpage-asset");
          continue;
        }
        if (/ - small$/i.test(entry.name)) {
          const siblingDir = join(
            currentDir,
            entry.name.replace(/ - small$/i, ""),
          );
          const siblingJpgs = await listJpgBasenames(siblingDir);
          const smallEntries = await readdir(fullPath, { withFileTypes: true });
          smallEntries.sort((left, right) =>
            left.name.localeCompare(right.name),
          );
          for (const child of smallEntries) {
            const childPath = join(fullPath, child.name);
            const childRel = toPosixPath(relative(resolvedRoot, childPath));
            if (child.isDirectory()) {
              await walk(childPath);
              continue;
            }
            const fileStats = await stat(childPath);
            const lowerName = child.name.toLowerCase();
            if (osMetadataNames.has(lowerName)) {
              skipped.push({
                sourcePath: childRel,
                reason: "os-metadata",
                bytes: fileStats.size,
              });
            } else if (
              /\.jpe?g$/i.test(child.name) &&
              siblingJpgs.has(lowerName)
            ) {
              skipped.push({
                sourcePath: childRel,
                reason: "redundant-small-folder",
                bytes: fileStats.size,
              });
            } else if (
              supportedImageExts.has(extname(child.name).toLowerCase())
            ) {
              photos.push({
                fullPath: childPath,
                sourcePath: childRel,
                bytes: fileStats.size,
              });
            } else {
              skipped.push({
                sourcePath: childRel,
                reason: "non-image",
                bytes: fileStats.size,
              });
            }
          }
          continue;
        }
        await walk(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;
      const fileStats = await stat(fullPath);

      if (inheritedSkipReason) {
        skipped.push({
          sourcePath: relPath,
          reason: inheritedSkipReason,
          bytes: fileStats.size,
        });
        continue;
      }

      const lowerName = entry.name.toLowerCase();
      const ext = extname(entry.name).toLowerCase();
      if (osMetadataNames.has(lowerName)) {
        skipped.push({
          sourcePath: relPath,
          reason: "os-metadata",
          bytes: fileStats.size,
        });
      } else if (videoExts.has(ext)) {
        skipped.push({
          sourcePath: relPath,
          reason: "video-excluded",
          bytes: fileStats.size,
        });
      } else if (ext === ".htm" || ext === ".html") {
        skipped.push({
          sourcePath: relPath,
          reason: "saved-webpage",
          bytes: fileStats.size,
        });
      } else if (supportedImageExts.has(ext)) {
        photos.push({
          fullPath,
          sourcePath: relPath,
          bytes: fileStats.size,
        });
      } else {
        skipped.push({
          sourcePath: relPath,
          reason: "non-image",
          bytes: fileStats.size,
        });
      }
    }
  }

  await walk(resolvedRoot);
  return { photos, skipped };
}

function encodeImage(pipeline, { format, quality, effort }) {
  if (format === "webp") {
    return pipeline.webp({ quality, effort, smartSubsample: true });
  }
  if (format === "jpeg") {
    return pipeline.jpeg({ quality, mozjpeg: true, progressive: true });
  }
  throw new Error(`Unsupported format: ${format}`);
}

export async function optimizeSinglePhoto(
  inputBuffer,
  {
    format = "webp",
    maxEdge = 1600,
    quality = 80,
    effort = 4,
    thumbEdge = 400,
    thumbQuality = 78,
  } = {},
) {
  const metadata = await sharp(inputBuffer).metadata();
  const orientation = metadata.orientation ?? 1;
  const rotated = orientation !== 1;
  const swapped = orientation >= 5 && orientation <= 8;
  const originalWidth = swapped ? metadata.height : metadata.width;
  const originalHeight = swapped ? metadata.width : metadata.height;
  const capturedAt = extractExifDate(metadata.exif);

  const mainPipeline = encodeImage(
    sharp(inputBuffer)
      .rotate()
      .resize({
        width: maxEdge,
        height: maxEdge,
        fit: "inside",
        withoutEnlargement: true,
      })
      .flatten({ background: "#ffffff" }),
    { format, quality, effort },
  );
  const mainResult = await mainPipeline.toBuffer({ resolveWithObject: true });

  let thumb = null;
  if (thumbEdge > 0) {
    const thumbPipeline = encodeImage(
      sharp(inputBuffer)
        .rotate()
        .resize({
          width: thumbEdge,
          height: thumbEdge,
          fit: "inside",
          withoutEnlargement: true,
        })
        .flatten({ background: "#ffffff" }),
      { format, quality: thumbQuality, effort },
    );
    const thumbResult = await thumbPipeline.toBuffer({
      resolveWithObject: true,
    });
    thumb = {
      data: thumbResult.data,
      width: thumbResult.info.width,
      height: thumbResult.info.height,
    };
  }

  return {
    main: {
      data: mainResult.data,
      width: mainResult.info.width,
      height: mainResult.info.height,
    },
    thumb,
    meta: {
      originalWidth,
      originalHeight,
      orientation,
      rotated,
      capturedAt,
    },
  };
}

function buildAlbumDescriptors(sourcePath, slugify) {
  const sourceDir = posix.dirname(sourcePath);
  const segments =
    sourceDir === "." ? [] : sourceDir.split("/").filter(Boolean);
  const displaySegments = segments.map(cleanDisplayTitle);
  const outputSegments = slugify
    ? segments.map(slugifySegment)
    : displaySegments;
  return {
    sourceDir: sourceDir === "." ? "" : sourceDir,
    albumSlug: outputSegments.join("/"),
    albumTitle: displaySegments.join(" / ") || "Root",
  };
}

function allocateOutputPaths(albumSlug, sourcePath, format, slugify, used) {
  const ext = format === "webp" ? ".webp" : ".jpg";
  const rawStem = basename(sourcePath, extname(sourcePath));
  const baseStem = slugify
    ? slugifySegment(rawStem)
    : cleanDisplayTitle(rawStem);
  const dirKey = albumSlug || ".";
  if (!used.has(dirKey)) used.set(dirKey, new Set());
  const usedNames = used.get(dirKey);

  let stem = baseStem;
  let counter = 2;
  while (usedNames.has(stem.toLowerCase())) {
    stem = `${baseStem}-${counter}`;
    counter += 1;
  }
  usedNames.add(stem.toLowerCase());

  const outputPath = albumSlug ? `${albumSlug}/${stem}${ext}` : `${stem}${ext}`;
  const thumbPath = albumSlug
    ? `${albumSlug}/thumbs/${stem}${ext}`
    : `thumbs/${stem}${ext}`;
  return { outputPath, thumbPath };
}

function isSafeToClean(resolvedOutputDir, cwd = process.cwd()) {
  const relToTmp = relative(resolve(cwd, "tmp"), resolvedOutputDir);
  if (relToTmp && !relToTmp.startsWith("..") && relToTmp !== ".") return true;
  if (existsSync(join(resolvedOutputDir, "manifest.json"))) return true;
  return false;
}

export async function optimizeBuildPhotos({
  inputDir = defaultInputDir,
  outputDir = defaultOutputDir,
  existingImagesDir = defaultExistingImagesDir,
  format = "webp",
  maxEdge = 1600,
  quality = 80,
  effort = 4,
  thumbEdge = 400,
  thumbQuality = 78,
  slugify = true,
  skipExisting = false,
  dedupe = false,
  concurrency = Math.max(2, Math.min(8, os.cpus().length - 1)),
  dryRun = false,
  cleanOutput = true,
} = {}) {
  if (!["webp", "jpeg"].includes(format)) {
    throw new Error(`Unsupported format "${format}". Use "webp" or "jpeg".`);
  }
  if (!Number.isInteger(maxEdge) || maxEdge <= 0) {
    throw new Error(`Invalid maxEdge: ${maxEdge}`);
  }
  if (!Number.isInteger(quality) || quality < 1 || quality > 100) {
    throw new Error(`Invalid quality: ${quality}`);
  }
  if (!Number.isInteger(thumbEdge) || thumbEdge < 0) {
    throw new Error(`Invalid thumbEdge: ${thumbEdge}`);
  }
  if (
    !Number.isInteger(thumbQuality) ||
    thumbQuality < 1 ||
    thumbQuality > 100
  ) {
    throw new Error(`Invalid thumbQuality: ${thumbQuality}`);
  }

  const resolvedInput = resolve(inputDir);
  const resolvedOutput = resolve(outputDir);
  if (!existsSync(resolvedInput)) {
    throw new Error(`Input directory does not exist: ${resolvedInput}`);
  }
  if (
    resolvedOutput === resolvedInput ||
    resolvedOutput.startsWith(`${resolvedInput}${sep}`)
  ) {
    throw new Error("Output directory must not be inside the input directory");
  }

  const existingHashes = await loadExistingSiteHashes(existingImagesDir);
  const { photos: candidates, skipped } =
    await collectInputFiles(resolvedInput);

  // Pre-hash sequentially in deterministic path order so duplicateOf and collision suffixes are 100% deterministic.
  const seenHashes = new Map();
  const usedNamesByDir = new Map();
  const workItems = [];

  for (const candidate of candidates) {
    const inputBuffer = await readFile(candidate.fullPath);
    const fullHash = createHash("sha256").update(inputBuffer).digest("hex");
    const sourceHash = fullHash.slice(0, 16);
    const existingSiteHash = existingHashes.has(sourceHash) ? sourceHash : null;
    const duplicateOf = seenHashes.get(fullHash) ?? null;

    if (skipExisting && existingSiteHash) {
      skipped.push({
        sourcePath: candidate.sourcePath,
        reason: "existing-site-photo",
        bytes: candidate.bytes,
      });
      continue;
    }
    if (dedupe && duplicateOf) {
      skipped.push({
        sourcePath: candidate.sourcePath,
        reason: "intra-duplicate",
        bytes: candidate.bytes,
      });
      continue;
    }
    if (!seenHashes.has(fullHash)) {
      seenHashes.set(fullHash, candidate.sourcePath);
    }

    const album = buildAlbumDescriptors(candidate.sourcePath, slugify);
    const { outputPath, thumbPath } = allocateOutputPaths(
      album.albumSlug,
      candidate.sourcePath,
      format,
      slugify,
      usedNamesByDir,
    );

    workItems.push({
      ...candidate,
      ...album,
      outputPath,
      thumbPath: thumbEdge > 0 ? thumbPath : null,
      sourceHash,
      existingSiteHash,
      duplicateOf,
    });
  }

  if (!dryRun) {
    if (cleanOutput && existsSync(resolvedOutput)) {
      if (!isSafeToClean(resolvedOutput)) {
        throw new Error(
          `Refusing to clean existing output directory outside tmp/ without manifest.json: ${resolvedOutput}`,
        );
      }
      await rm(resolvedOutput, { recursive: true, force: true });
    }
    await mkdir(resolvedOutput, { recursive: true });
  }

  const results = new Array(workItems.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= workItems.length) return;

      const item = workItems[current];
      const inputBuffer = await readFile(item.fullPath);
      const optimized = await optimizeSinglePhoto(inputBuffer, {
        format,
        maxEdge,
        quality,
        effort,
        thumbEdge,
        thumbQuality,
      });

      if (!dryRun) {
        const mainAbs = join(resolvedOutput, item.outputPath);
        await mkdir(dirname(mainAbs), { recursive: true });
        await writeFile(mainAbs, optimized.main.data);

        if (optimized.thumb && item.thumbPath) {
          const thumbAbs = join(resolvedOutput, item.thumbPath);
          await mkdir(dirname(thumbAbs), { recursive: true });
          await writeFile(thumbAbs, optimized.thumb.data);
        }
      }

      results[current] = {
        album: item.albumSlug,
        albumTitle: item.albumTitle,
        sourcePath: item.sourcePath,
        outputPath: item.outputPath,
        thumbPath: item.thumbPath,
        width: optimized.main.width,
        height: optimized.main.height,
        thumbWidth: optimized.thumb?.width ?? null,
        thumbHeight: optimized.thumb?.height ?? null,
        originalWidth: optimized.meta.originalWidth,
        originalHeight: optimized.meta.originalHeight,
        originalBytes: item.bytes,
        outputBytes: optimized.main.data.length,
        thumbBytes: optimized.thumb?.data.length ?? 0,
        rotated: optimized.meta.rotated,
        capturedAt: optimized.meta.capturedAt,
        sourceHash: item.sourceHash,
        existingSiteHash: item.existingSiteHash,
        duplicateOf: item.duplicateOf,
      };
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, workItems.length || 1));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  results.sort((left, right) =>
    left.outputPath.localeCompare(right.outputPath),
  );
  skipped.sort((left, right) =>
    left.sourcePath.localeCompare(right.sourcePath),
  );

  const albumMap = new Map();
  let sourceBytes = 0;
  let mainOutputBytes = 0;
  let thumbOutputBytes = 0;
  let rotatedPhotos = 0;
  let existingSiteMatches = 0;
  let intraDuplicates = 0;

  for (const photo of results) {
    sourceBytes += photo.originalBytes;
    mainOutputBytes += photo.outputBytes;
    thumbOutputBytes += photo.thumbBytes;
    if (photo.rotated) rotatedPhotos += 1;
    if (photo.existingSiteHash) existingSiteMatches += 1;
    if (photo.duplicateOf) intraDuplicates += 1;

    if (!albumMap.has(photo.album)) {
      albumMap.set(photo.album, {
        slug: photo.album,
        title: photo.albumTitle,
        sourceDir:
          posix.dirname(photo.sourcePath) === "."
            ? ""
            : posix.dirname(photo.sourcePath),
        photoCount: 0,
        sourceBytes: 0,
        mainOutputBytes: 0,
        thumbOutputBytes: 0,
      });
    }
    const albumEntry = albumMap.get(photo.album);
    albumEntry.photoCount += 1;
    albumEntry.sourceBytes += photo.originalBytes;
    albumEntry.mainOutputBytes += photo.outputBytes;
    albumEntry.thumbOutputBytes += photo.thumbBytes;
  }

  const albums = [...albumMap.values()].sort((left, right) =>
    left.slug.localeCompare(right.slug),
  );
  const totalOutputBytes = mainOutputBytes + thumbOutputBytes;
  const bytesSaved = sourceBytes - totalOutputBytes;
  const percentSaved =
    sourceBytes > 0 ? Number(((bytesSaved / sourceBytes) * 100).toFixed(2)) : 0;

  const manifest = {
    generatedAt: new Date().toISOString(),
    settings: {
      format,
      maxEdge,
      quality,
      effort,
      thumbEdge,
      thumbQuality,
      slugify,
      skipExisting,
      dedupe,
    },
    summary: {
      scannedFiles: candidates.length + skipped.length,
      processedPhotos: results.length,
      skippedFiles: skipped.length,
      rotatedPhotos,
      existingSiteMatches,
      intraDuplicates,
      sourceBytes,
      mainOutputBytes,
      thumbOutputBytes,
      totalOutputBytes,
      bytesSaved,
      percentSaved,
    },
    albums,
    photos: results,
    skipped,
  };

  if (!dryRun) {
    await writeFile(
      join(resolvedOutput, "manifest.json"),
      JSON.stringify(manifest, null, 2) + "\n",
    );
  }

  return manifest;
}

function parseCliArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      input: { type: "string", default: defaultInputDir },
      output: { type: "string", default: defaultOutputDir },
      "existing-images": { type: "string", default: defaultExistingImagesDir },
      format: { type: "string", default: "webp" },
      "max-edge": { type: "string", default: "1600" },
      quality: { type: "string", default: "80" },
      effort: { type: "string", default: "4" },
      "thumb-edge": { type: "string", default: "400" },
      "thumb-quality": { type: "string", default: "78" },
      "no-thumbs": { type: "boolean", default: false },
      "no-slugify": { type: "boolean", default: false },
      "skip-existing": { type: "boolean", default: false },
      dedupe: { type: "boolean", default: false },
      concurrency: { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
  });

  return {
    inputDir: values.input,
    outputDir: values.output,
    existingImagesDir: values["existing-images"],
    format: values.format.toLowerCase(),
    maxEdge: Number.parseInt(values["max-edge"], 10),
    quality: Number.parseInt(values.quality, 10),
    effort: Number.parseInt(values.effort, 10),
    thumbEdge: values["no-thumbs"]
      ? 0
      : Number.parseInt(values["thumb-edge"], 10),
    thumbQuality: Number.parseInt(values["thumb-quality"], 10),
    slugify: !values["no-slugify"],
    skipExisting: values["skip-existing"],
    dedupe: values.dedupe,
    ...(values.concurrency
      ? { concurrency: Number.parseInt(values.concurrency, 10) }
      : {}),
    dryRun: values["dry-run"],
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const startedAt = Date.now();
  const options = parseCliArgs(process.argv.slice(2));
  const manifest = await optimizeBuildPhotos(options);
  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  const { summary } = manifest;
  const toMiB = (bytes) => (bytes / (1024 * 1024)).toFixed(1);
  console.log(
    `${options.dryRun ? "[dry-run] " : ""}Optimized ${summary.processedPhotos} photos (${manifest.albums.length} albums, ${summary.skippedFiles} skipped, ${summary.rotatedPhotos} auto-rotated) in ${elapsedSec}s: ${toMiB(summary.sourceBytes)} MiB -> ${toMiB(summary.totalOutputBytes)} MiB (${toMiB(summary.mainOutputBytes)} MiB full + ${toMiB(summary.thumbOutputBytes)} MiB thumbs, ${summary.percentSaved}% saved).`,
  );
}
