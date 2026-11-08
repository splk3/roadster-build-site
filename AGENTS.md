# Repository Instructions

## Build and verification

Use Node 24 LTS and npm (`npm ci` for a clean install). The main checks are:

```sh
npm run build
npm test
npm run validate
npx playwright install --with-deps chromium
npm run test:e2e
npm run lint
npm run lint:super
```

Run one Node test with `node --test --test-name-pattern="test name" tests/content.test.mjs`.
Run one browser test with `npx playwright test tests/site.spec.mjs -g "test name"`.
`npm run lint:super` requires Docker. `npm run validate` checks generated pages,
links, media, archive data, output size, and workflow policy. The browser test
command starts its own local server.

## Architecture

This is a frozen Eleventy archive, not a live WordPress application. Eleventy
builds Nunjucks templates from `src/` into `_site/`; only `_site/` is published.
The committed `src/_data/archive.json` is the normal source for the posts,
informational pages, comments, taxonomy, and local media references.
`src/_data/site.json` holds site metadata/navigation, while
`src/_data/build.js` supplies the build revision. Templates in `src/` generate
the archive, post and taxonomy routes, search index, and static utility pages;
`src/_includes/` contains shared layout and post fragments. CSS and browser
scripts in `src/assets/` are copied through to the output.

WordPress reimport is an explicit maintenance operation, not part of a normal
build. It uses `scripts/import-wordpress.mjs` and requires the private XML and
original uploads described in the README. Read the migration and follow-up
constraints in [README.md](README.md) and
[docs/migration-report.md](docs/migration-report.md) before changing or
reimporting archival content.

## Conventions

- Keep archive routes and internal links local and canonical; generated output
  is checked by `npm run validate`.
- Archive rich-text fields are intentionally rendered as trusted HTML. Preserve
  the importer's cleanup/sanitization path for imported content; escape ordinary
  text in templates rather than marking it safe.
- Search is client-side over a generated local index. Preserve useful static
  browsing and no-JavaScript behavior when changing templates or scripts.
- Pages deployment is gated by the validation workflow and publishes only the
  built artifact. Follow the README's cutover and workflow guidance when
  changing deployment configuration.
