# Migration and follow-up report

## Inputs and preservation

The supplied Simply Static HTML and WordPress XML agree on **44 published posts
and three informational pages**. The XML recovers **20 approved post comments**.
One approved comment on an attachment is outside the agreed article/page scope
and was not imported. Drafts, plugin-defined block records, and menu records are
not archive articles.

Raw XML remains private in ignored `tmp/`; the original export is preserved
locally in `tmp/original-export/` and in the pre-migration Git history. Normal
builds use the committed public archive and optimized media only.

All reviewed content corrections are stored deterministically in
[curation.json](../src/_data/curation.json) and applied automatically by
`scripts/import-wordpress.mjs`, so reimporting from the preserved XML and
uploads reproduces the cleaned archive exactly.

## Completed cleanup

- Removed **23 verified prepended cross-post/self-repeated duplicate blocks**
  from 23 corrupted posts and pages (originally caused by historical WordPress
  database corruption also present on the live site), reducing total post
  `<img>` instances from 796 to **339 unique images** and dropping repetition
  findings from **64 to 0**. Intentional shared welcome prose on _Roadster
  Ordered!_ (`ID 16`) was preserved.
- Removed **93** pharmaceutical/spam links **and their injected anchor words**
  across the deduplicated records (originally 232 before removing duplicated
  prefixes).
- Repaired **493** instances of known UTF-8 mojibake in text nodes without
  re-decoding valid punctuation.
- Converted WordPress paragraph breaks to valid HTML paragraphs, retained lists,
  and preserved article text, excerpt boundaries, public author/date metadata,
  category/tag membership, and approved comment parent/anchor relationships.
- Preserved full comment timestamps as the original site's local date/time,
  without inventing a timezone.
- Removed active markup, unsafe URL schemes, obsolete styles/attributes,
  **42** dead gallery/social/channel links, **37** obsolete _"More photos in
  the Gallery"_ sentences left behind after link removal, and empty attachment
  anchors.
- Replaced image proxies, thumbnails, raw image URLs, and absent attachment-page
  links with locally generated display/large-view photos.
- Replaced generic/camera-filename/paragraph-dump image alt text with **338**
  concise, visually verified photograph descriptions in
  `src/_data/curation.json` and empty `alt=""` on the **1** decorative inline
  emoticon (`wlEmoticon-sadsmile.png`). Zero fallback or timestamp-filename alt
  values remain.
- Updated two broken historical Factory Five and Build School URLs via
  `linkRewrites` (**3** link instances) and audited all remaining external
  links (see below).
- Kept useful build-resource and direct video links. Turned bare engine-video
  URLs into usable direct links, without loading a third-party video player.
- Excluded private commenter emails/IPs, WordPress scripts/plugins/admin/forms,
  feed/subscription/sharing widgets, original-resolution downloads, unused
  uploads, and source backups from the static build.

The generated [JSON inventory](migration-report.json) records each scoped source
ID, title, applied text/link/image/curation edits, omitted comment count, and
repetition verification result (`0` findings). It intentionally does not
reproduce raw XML or private fields.

## Post-migration site enhancements

- Added an SVG roadster favicon, Open Graph and Twitter Card metadata, and
  schema.org structured data for the home page and posts.
- Added **44 static HTML redirect pages** covering every historical date-based
  WordPress post URL (`/YYYY/MM/DD/slug/`), with `<link rel="canonical">`,
  `<meta http-equiv="refresh">`, hash-preserving JavaScript (`#comment-*`), and
  an accessible no-JavaScript fallback link, alongside canonical redirects for
  `/?p=<id>` links and legacy URL discovery on `/404.html`.
- Enhanced client-side search with publication dates, contextual snippets,
  safe keyword highlighting, and debounced live results.
- Added print styles for article pages and an Atom feed at `/feed.xml`
  containing all 44 published posts.

## External link audit

All 10 unique external URLs across the deduplicated archive were checked before
cutover:

| URL                                                                                              | Status                     | Disposition                                                      |
| ------------------------------------------------------------------------------------------------ | -------------------------- | ---------------------------------------------------------------- |
| `https://www.factoryfive.com/`                                                                   | 200 OK                     | Kept                                                             |
| `https://www.factoryfive.com/roadster/` _(was `http://www.factoryfive.com/rdsterhome.html`)_     | 200 OK _(was 404)_         | Updated via `linkRewrites`                                       |
| `https://www.factoryfive.com/build-school/` _(was `http://www.mcc.edu/factoryfive/index.shtml`)_ | 200 OK _(was 404)_         | Updated via `linkRewrites`                                       |
| `http://www.ffcars.com/`                                                                         | 200 OK                     | Kept                                                             |
| `http://www.thefactoryfiveforum.com/`                                                            | 200 OK                     | Kept                                                             |
| `http://www.youtube.com/watch?feature=player_detailpage&v=_odOdV5Nuro`                           | 200 Playable               | Kept (First Engine Start)                                        |
| `http://www.youtube.com/watch?v=0wTkApp10z0&feature=player_detailpage`                           | 200 Playable               | Kept (First Drive)                                               |
| `http://www.youtube.com/watch?v=wjd8aaQx_3M`                                                     | 200 Playable               | Kept (Build School startup)                                      |
| `http://www.youtube.com/watch?v=K6grmNS1YLo`                                                     | 200 Playable               | Kept (Build School test drive)                                   |
| `https://www.youtube.com/watch?v=4TQGS8QAohM`                                                    | Private (`LOGIN_REQUIRED`) | Kept as historical link (Proformance Unlimited engine run video) |

## Validation results

The resulting site contains **214 validated HTML pages** (170 archive pages plus
44 static legacy redirect stubs) and **1,007 images**: 1,006 optimized JPEG
variants from 340 referenced source photographs (including the banner), plus the
SVG favicon. The complete deployment is **94.8 MiB**, well below the 500 MiB
budget. Reimporting from the preserved original-export backup reproduces the
entire cleaned archive deterministically.

The current working tree passes the build, 11 unit/content/curation/workflow
tests, 12 browser tests including refreshed light/dark/mobile visual baselines,
axe accessibility checks, legacy date-based and WordPress ID redirects,
generated link/fragment/image/srcset/canonical and archive/search coverage,
local ESLint/Stylelint/Prettier, Atom feed parsing, and Super-Linter checks.

These are local results, not a claim that GitHub Actions or the custom domain
has already deployed.

## Remaining optional follow-ups

- Decide whether to recover the single excluded attachment comment and any
  separate gallery photos as a later, explicitly expanded scope.
- Decide whether to make YouTube video `4TQGS8QAohM` unlisted/public in YouTube
  Studio if you still control the uploading account.

## Deployment follow-up

The repository contains SHA-pinned validation and Pages deployment workflows,
but publication requires a reviewed commit/push plus owner-controlled Pages
settings and DNS cutover. These are not silently performed by local validation.
Use the [cutover checklist](../README.md#github-pages-cutover), including HTTPS,
configuring an external DNS/edge `301` redirect for
`www.roadster.mightypirates.com` → `https://roadster.mightypirates.com/$1`, the
actual deployed commit marker, and a real missing-route/404 check.

The deployment contains only optimized referenced media and generated pages and
is subject to a strict **500 MiB** budget. Raw uploads, the XML, and legacy
WordPress trees are never published. Keep the original hosting/backups until
custom-domain verification succeeds.

Git history still retains the large original export. CI uses shallow checkouts
and lints the full current source with Super-Linter's find mode; it does not need
to download the legacy history. Do not rewrite that history without a separate,
explicitly reviewed decision.
