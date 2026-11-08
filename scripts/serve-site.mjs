import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, join } from "node:path";

const root = resolve("_site");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".jpg": "image/jpeg",
  ".xml": "application/xml",
  ".txt": "text/plain",
};
createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1");
    let path = resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (path !== root && !path.startsWith(`${root}/`)) {
      response.writeHead(400).end("Invalid path");
      return;
    }
    if ((await stat(path)).isDirectory()) path = join(path, "index.html");
    response.writeHead(200, {
      "Content-Type": mime[extname(path)] ?? "application/octet-stream",
    });
    response.end(await readFile(path));
  } catch (error) {
    if (error.code === "ENOENT") {
      response.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      response.end(await readFile(join(root, "404.html")));
    } else {
      console.error("Static preview request failed", error);
      response.writeHead(500).end("Static preview error");
    }
  }
}).listen(4178, "127.0.0.1", () =>
  console.log("Archive preview: http://127.0.0.1:4178"),
);
