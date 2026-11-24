import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import {
  basename,
  extname,
  join,
  posix,
  relative,
  resolve,
  sep,
} from "node:path";

const supportedPhotoExts = new Set([".webp", ".jpg", ".jpeg", ".png"]);
const cameraStemPattern =
  /^(?:dsc\d+(?:-\d+)?|img[-_]?\d+|p\d{6,}|pxl[-_]?\d+|mvimg[-_]?\d+|unnamed(?:-\d+)?|dan-s-car-su.*|\d{4}-\d{2}-\d{2}.*|\d{8}[-_]\d{6}.*)$/i;

function toPosix(filePath) {
  return filePath.split(sep).join(posix.sep);
}

export function slugToTitle(slug) {
  return slug
    .split("/")
    .map((segment) =>
      segment
        .split("-")
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" "),
    )
    .join(" — ");
}

export function humanizeStem(stem) {
  if (!stem || cameraStemPattern.test(stem)) return null;
  const cleaned = stem.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function formatReliableCaptureDate(capturedAt) {
  if (!capturedAt || typeof capturedAt !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(capturedAt);
  if (!match) return null;
  const year = Number(match[1]);
  // Filter out unconfigured camera clock defaults (e.g., 2005) outside the 2011–2014 build window
  if (year < 2010 || year > 2015) return null;
  return new Date(
    `${match[1]}-${match[2]}-${match[3]}T12:00:00Z`,
  ).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function buildPhotoLabels(albumTitle, stem, index, total, capturedAt) {
  const descriptive = humanizeStem(stem);
  const dateLabel = formatReliableCaptureDate(capturedAt);
  const alt = descriptive
    ? `${albumTitle} — ${descriptive}`
    : `${albumTitle} — Photo ${index} of ${total}`;
  const caption = descriptive || `${albumTitle} — Photo ${index} of ${total}`;
  const metaParts = [`Photo ${index} of ${total}`];
  if (dateLabel) metaParts.push(dateLabel);
  return {
    alt,
    caption,
    metaText: metaParts.join(" · "),
    dateLabel,
  };
}

async function discoverAlbumDirectories(galleryRoot) {
  const resolvedRoot = resolve(galleryRoot);
  if (!existsSync(resolvedRoot)) return [];

  const discovered = [];

  async function walk(currentDir) {
    const entries = await readdir(currentDir, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    const photoFiles = [];
    const childDirs = [];

    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (entry.name.toLowerCase() === "thumbs") continue;
        childDirs.push(join(currentDir, entry.name));
      } else if (
        entry.isFile() &&
        supportedPhotoExts.has(extname(entry.name).toLowerCase())
      ) {
        photoFiles.push(entry.name);
      }
    }

    const relSlug = toPosix(relative(resolvedRoot, currentDir));
    if (relSlug && photoFiles.length > 0) {
      discovered.push({
        slug: relSlug,
        dirPath: currentDir,
        files: photoFiles,
      });
    }

    for (const childDir of childDirs) {
      await walk(childDir);
    }
  }

  await walk(resolvedRoot);
  return discovered;
}

export async function loadGalleryData({
  galleryDir = "src/assets/gallery",
  manifestPath = "src/_data/gallery-manifest.json",
  linksPath = "src/_data/gallery-links.json",
  archivePath = "src/_data/archive.json",
} = {}) {
  const manifest = existsSync(resolve(manifestPath))
    ? JSON.parse(await readFile(resolve(manifestPath), "utf8"))
    : { albums: {}, photos: {} };
  const linksConfig = existsSync(resolve(linksPath))
    ? JSON.parse(await readFile(resolve(linksPath), "utf8"))
    : { albumOrder: [], albumTitles: {}, postLinks: {} };
  const archive = existsSync(resolve(archivePath))
    ? JSON.parse(await readFile(resolve(archivePath), "utf8"))
    : { posts: [] };

  const postsByUrl = new Map();
  const totalPosts = archive.posts.length;
  archive.posts.forEach((post, index) => {
    const number = totalPosts - index;
    postsByUrl.set(post.url, {
      number,
      paddedNumber: String(number).padStart(2, "0"),
      title: post.title,
      url: post.url,
      date: post.date,
      terms: [
        ...(post.categories || []).map((term) => term.title),
        ...(post.tags || []).map((term) => term.title),
      ],
    });
  });

  // Invert postLinks into albumSlug -> post summaries
  const postsByAlbumSlug = new Map();
  for (const [postUrl, entry] of Object.entries(linksConfig.postLinks || {})) {
    const postSummary = postsByUrl.get(postUrl);
    if (!postSummary) continue;
    for (const albumSlug of entry.albums || []) {
      if (!postsByAlbumSlug.has(albumSlug)) postsByAlbumSlug.set(albumSlug, []);
      postsByAlbumSlug.get(albumSlug).push(postSummary);
    }
  }
  for (const list of postsByAlbumSlug.values()) {
    list.sort((left, right) => left.number - right.number);
  }

  const orderIndex = new Map(
    (linksConfig.albumOrder || []).map((slug, idx) => [slug, idx]),
  );

  const directories = await discoverAlbumDirectories(galleryDir);
  const albums = directories.map(({ slug, dirPath, files }) => {
    const title =
      linksConfig.albumTitles?.[slug] ||
      manifest.albums?.[slug] ||
      slugToTitle(slug);
    const total = files.length;

    const photos = files.map((fileName, idx) => {
      const relOutputPath = `${slug}/${fileName}`;
      const meta = manifest.photos?.[relOutputPath] || {};
      const thumbDiskPath = join(dirPath, "thumbs", fileName);
      const hasThumb = existsSync(thumbDiskPath);
      const relThumbPath = hasThumb
        ? `${slug}/thumbs/${fileName}`
        : relOutputPath;
      const stem = basename(fileName, extname(fileName));
      const labels = buildPhotoLabels(
        title,
        stem,
        idx + 1,
        total,
        meta.capturedAt ?? null,
      );

      return {
        index: idx + 1,
        id: `photo-${idx + 1}`,
        fileName,
        fullUrl: `/assets/gallery/${relOutputPath}`,
        thumbUrl: `/assets/gallery/${relThumbPath}`,
        width: meta.width ?? 1600,
        height: meta.height ?? 1200,
        thumbWidth: hasThumb ? (meta.thumbWidth ?? 400) : (meta.width ?? 1600),
        thumbHeight: hasThumb
          ? (meta.thumbHeight ?? 300)
          : (meta.height ?? 1200),
        capturedAt: meta.capturedAt ?? null,
        ...labels,
      };
    });

    const cover =
      photos.find((photo) => photo.thumbWidth >= photo.thumbHeight) ||
      photos[0];
    const posts = postsByAlbumSlug.get(slug) || [];
    const earliestPost = posts[0] || null;
    const latestPost = posts[posts.length - 1] || null;
    const periodLabel = earliestPost
      ? earliestPost === latestPost
        ? `Post #${earliestPost.paddedNumber}`
        : `Posts #${earliestPost.paddedNumber}–#${latestPost.paddedNumber}`
      : "Build Archive";

    const searchTokens = [
      title,
      slug.replaceAll("-", " "),
      ...posts.flatMap((post) => [
        `#${post.paddedNumber}`,
        `#${post.number}`,
        post.title,
        ...post.terms,
      ]),
    ];

    return {
      slug,
      title,
      url: `/gallery/${slug}/`,
      photoCount: photos.length,
      cover,
      photos,
      posts,
      periodLabel,
      earliestPostNumber: earliestPost?.number ?? 999,
      searchText: searchTokens.join(" ").toLowerCase(),
    };
  });

  albums.sort((left, right) => {
    const leftOrder = orderIndex.has(left.slug)
      ? orderIndex.get(left.slug)
      : 999;
    const rightOrder = orderIndex.has(right.slug)
      ? orderIndex.get(right.slug)
      : 999;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    if (left.earliestPostNumber !== right.earliestPostNumber) {
      return left.earliestPostNumber - right.earliestPostNumber;
    }
    return left.title.localeCompare(right.title);
  });

  const albumsBySlug = new Map();
  albums.forEach((album, index) => {
    album.sortIndex = index + 1;
    album.prevAlbum =
      index > 0
        ? {
            slug: albums[index - 1].slug,
            title: albums[index - 1].title,
            url: albums[index - 1].url,
            photoCount: albums[index - 1].photoCount,
          }
        : null;
    album.nextAlbum =
      index < albums.length - 1
        ? {
            slug: albums[index + 1].slug,
            title: albums[index + 1].title,
            url: albums[index + 1].url,
            photoCount: albums[index + 1].photoCount,
          }
        : null;
    albumsBySlug.set(album.slug, album);
  });

  const byPostUrl = {};
  for (const [postUrl, entry] of Object.entries(linksConfig.postLinks || {})) {
    const linkedAlbums = (entry.albums || [])
      .map((slug) => albumsBySlug.get(slug))
      .filter(Boolean)
      .map((album) => ({
        slug: album.slug,
        title: album.title,
        url: album.url,
        photoCount: album.photoCount,
        cover: album.cover,
      }));
    if (linkedAlbums.length > 0) {
      byPostUrl[postUrl] = {
        note: entry.note,
        albums: linkedAlbums,
      };
    }
  }

  return {
    albums,
    totalAlbums: albums.length,
    totalPhotos: albums.reduce((sum, album) => sum + album.photoCount, 0),
    byPostUrl,
  };
}
