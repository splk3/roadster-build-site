# Dan and Pat Build a Roadster

A frozen Eleventy archive for <https://roadster.mightypirates.com/>, with 44 posts,
three informational pages, and 20 historical post comments. No WordPress server,
database, comment service, subscription service, or image proxy is required.

## Build and validate

Use Node 24 LTS, npm, and Docker for the full Super-Linter suite.

```sh
npm ci
npm run build
npm test
npm run validate
npx playwright install --with-deps chromium
npm run test:e2e
npm run lint
npm run lint:super
```

`npm run dev` starts Eleventy's local preview. The browser tests start and stop
their own loopback-only server. `npm run validate` checks every generated HTML
page, internal link/fragment, image/srcset, archive record, output budget, and
workflow pin/permission policy. Browser tests include accessibility, theme
preferences, search, mobile layout, and visual regression baselines.

The committed cleaned content is `src/_data/archive.json`; ordinary builds do
not need the private XML or the legacy export. Layouts live in `src/_includes/`,
with local CSS, JavaScript, and optimized photographs in `src/assets/`.
The build publishes **only `_site/`**, never the repository root.

## Reimporting the historical export

Keep the raw XML private, in ignored `tmp/` or another local backup. It includes
commenter emails/IPs that must not be committed. The importer explicitly selects
only public comment fields.

```sh
npm run import -- tmp/danandpatbuildaroadster.WordPress.2026-11-07.xml
npm run format
npm run build
npm test
npm run validate
```

Original HTML/uploads are retained locally in ignored `tmp/original-export/`
after migration and also exist in Git's pre-migration history. Reimport needs
both the XML and these local uploads. Restore an original export from a trusted
backup when working in a fresh clone; normal CI builds do not reimport.
The importer checks the 44-post/three-page scope and errors on missing/extra
published content, unresolved local media/links, unsupported shortcodes, or
invalid comment threads. It generates JPEG display/large-view variants, never
original-resolution downloads. The output budget is 500 MiB.

**Content review remains necessary:** both source formats contain cross-post
duplication. Confirmed spam and encoding damage were cleaned; ambiguous copied
passages were retained rather than guessing article boundaries. See
[the follow-up report](docs/migration-report.md) and its per-record
[edit inventory](docs/migration-report.json). Manual edits to the cleaned archive
will be replaced on reimport; preserve reviewed corrections in an authoritative
XML source before importing again.

## Theme and archived comments

Light mode follows the original blue navigation, italic title, roadster banner,
serif articles, and pale sidebar design. Dark mode follows the same layout.
The initial theme follows the local browser/OS preference, including later system
changes until manually overridden. The header sun/moon button saves a manual
choice in local storage. Blocked storage produces a diagnostic but does not
prevent theme switching in the current session. Without JavaScript the site
follows the system theme, hides the toggle, and remains readable/navigable.

Search runs locally in the browser. Without JavaScript, browse the paginated
posts or category/tag archives. Comments are static historical content; there
are no reply, login, feed, subscription, or sharing controls.

## GitHub Pages cutover

The deployment workflow runs on `main` pushes or manual dispatch on `main`.
It calls the same lint/build/test gates as PR validation, uploads the validated
artifact, and deploys only after all jobs pass. Fork PRs cannot deploy.
Permissions are read-only except for the final Pages/OIDC deployment job.

1. Commit and push the reviewed migration to `main`.
2. In repository Settings > Pages, select **GitHub Actions** as the build source.
   Configure the `github-pages` environment to allow only `main`, and require the
   source-lint and build/test checks in branch protection.
3. Verify domain ownership where applicable and set
   `roadster.mightypirates.com` in Pages settings **before changing DNS**. The
   committed `CNAME` file does not replace this setting for Actions publishing.
4. Point that hostname's DNS CNAME to `splk3.github.io` (no repository path).
   Resolve conflicting records for this hostname only, not unrelated services.
5. Run or rerun **Deploy Pages** after the Pages/domain settings are configured.
   When GitHub's certificate is ready, enable HTTPS. Verify home, all three pages,
   a post and its comment anchor, search, taxonomy routes, photos, and an actual
   nonexistent URL serving the themed 404.

Check `/build-info.json` against the deployed commit SHA to avoid accepting an
old cached deployment. Existing date-based post URLs intentionally changed to
`/posts/{slug}/`; there is no blanket server-side redirect support on Pages.
The old `www.roadster.mightypirates.com` hostname needs a separate owner decision.
Do not retire the original hosting until the custom-domain checks succeed.

Actions use full verified release commit SHAs with exact release-tag comments.
Dependabot proposes updates for npm and GitHub Actions. Review both the SHA/tag
mapping and latest stable release before accepting updates; upstream action
internals are intentionally accepted as supplied by their maintainers.
Local `lint:super` uses the same settings and release as the CI action.

For rollback, redeploy a previously validated commit on `main` (or revert the
specific migration changes through a reviewed PR); do not delete the private
source backups or rewrite repository history.
