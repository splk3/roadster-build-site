const defaultUrl = "https://roadster.mightypirates.com/";

export function deploymentUrl(value = process.env.SITE_URL || defaultUrl) {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "SITE_URL must be an HTTP(S) URL without credentials, query, or fragment",
    );
  }
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url;
}

export function localUrl(path, base = deploymentUrl()) {
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  const prefix = base.pathname.slice(0, -1);
  if (prefix && (path === prefix || path.startsWith(`${prefix}/`))) return path;
  return `${prefix}${path}`;
}

export function absoluteUrl(path, base = deploymentUrl()) {
  return new URL(localUrl(path, base), base.origin).href;
}
