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

No ambiguous historical article passages were deleted. The owner requested
implementation with follow-up cleanup reporting, so unresolved repetition is
documented rather than used to guess new article boundaries.

## Completed cleanup

- Removed **232** confirmed pharmaceutical/spam links **and their injected anchor
  words**, including the additional drug-name domains identified during cleanup.
- Repaired known UTF-8 mojibake in text nodes without re-decoding valid punctuation.
- Converted WordPress paragraph breaks to valid HTML paragraphs, retained lists,
  and preserved article text, excerpt boundaries, public author/date metadata,
  category/tag membership, and approved comment parent/anchor relationships.
- Preserved full comment timestamps as the original site's local date/time,
  without inventing a timezone.
- Removed active markup, unsafe URL schemes, obsolete styles/attributes,
  channel/social/gallery link destinations, and empty attachment anchors.
- Replaced image proxies, thumbnails, raw image URLs, and absent attachment-page
  links with locally generated display/large-view photos.
- Kept useful build-resource and direct video links. Turned bare engine-video
  URLs into usable direct links, without loading a third-party video player.
- Kept the first usable `more` fragment and removed duplicate IDs introduced by
  repeated content; the associated text was retained.
- Excluded private commenter emails/IPs, WordPress scripts/plugins/admin/forms,
  feed/subscription/sharing widgets, original-resolution downloads, unused
  uploads, and source backups from the static build.

The generated [JSON inventory](migration-report.json) records each scoped source
ID, title, applied text/link/image edits, omitted comment count, and repetition
candidate. It intentionally does not reproduce raw XML or private fields.

## Validation results

The resulting site contains **170 validated HTML pages** and **1,006 optimized
JPEG variants** from 340 referenced source photographs (including the banner).
The complete deployment is approximately **95 MiB**, below the 500 MiB budget.
Reimporting from the preserved original-export backup reproduced the entire
cleaned archive exactly.

Validation passed: ten unit/content/workflow tests, nine browser tests including
light/dark/mobile visual baselines and axe accessibility checks, every generated
internal link/fragment/image/srcset, archive/search coverage, local ESLint/
Stylelint/Prettier, and the release-pinned Super-Linter container across all
maintained JavaScript, JSON, CSS, Markdown, YAML, workflows, and shell files.
The browser tests verify the actual no-JavaScript fallback and system dark theme.

These are local results, not a claim that GitHub Actions or the custom domain
has already deployed.

## Follow-up content work

**Review the 64 repetition candidates** in `migration-report.json`. These are
normalized text matches, not 64 independently proven errors: shared introductions
can be intentional. Complete-body matches are stronger evidence than matching
opening passages. Partial/mid-article contamination still requires owner review.

| Priority examples                                        | Evidence                                                                       | Follow-up                                                                            |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Clutch/Throttle Cable (ID 239)                           | Includes the complete later Dash/Gauges article (ID 261)                       | Confirm the intended starting paragraph and remove only the verified copied section. |
| Engine Update (ID 143)                                   | Includes the complete Engine Build article (ID 132)                            | Check whether the repeated material was intended or inserted.                        |
| Completing Sheet Metal (ID 341)                          | Includes Finished Paint/Final Assembly (ID 476) and other overlapping passages | Reconstruct article boundaries against a clean backup or owner review.               |
| Engine Ordered (ID 26), Build Info (ID 18), About (ID 2) | Nested shared opening/body matches                                             | Distinguish intentional introductory text from unrelated copies.                     |
| Suspension, fuel/brake-line, and bodywork articles       | Several complete/opening-passage matches                                       | Review the complete JSON candidate list, including partial copies.                   |

After review, correct the authoritative source or the committed cleaned archive,
record the exact changes, and rerun the full validation suite. Reimporting
unchanged XML will restore its duplicated passages.

Other follow-up work:

- Improve generic photograph descriptions where the XML provided empty or camera
  filename alt text. The importer used available article/paragraph context; no
  visual description was fabricated.
- Review obsolete prose such as “more photos in the Gallery” and channel promotion.
  Their external destinations were removed, but the historical sentences remain.
- Check external build-resource/video links manually. These are deliberately not
  blocking offline CI because old services can be unavailable.
- Decide whether to recover the attachment comment and any separate gallery
  photos as a later, explicitly expanded scope.
- Decide whether old date-based article URLs and the old `www` hostname need
  compatibility redirects; they are not part of the agreed new-URL migration.

## Deployment follow-up

The repository contains SHA-pinned validation and Pages deployment workflows,
but publication requires a reviewed commit/push plus owner-controlled Pages
settings and DNS cutover. These are not silently performed by local validation.
Use the [cutover checklist](../README.md#github-pages-cutover), including HTTPS,
the actual deployed commit marker, and a real missing-route/404 check.

The deployment contains only optimized referenced media and generated pages and
is subject to a strict **500 MiB** budget. Raw uploads, the XML, and legacy
WordPress trees are never published. Keep the original hosting/backups until
custom-domain verification succeeds.

Git history still retains the large original export. CI uses shallow checkouts
and lints the full current source with Super-Linter's find mode; it does not need
to download the legacy history. Do not rewrite that history without a separate,
explicitly reviewed decision.
