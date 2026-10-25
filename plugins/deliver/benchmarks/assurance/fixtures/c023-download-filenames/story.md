# S4-5: Safe filenames for file downloads
<!-- pm-meta: {"builder":"expert-builder","touches":["src","test"]} -->
Sprint: 4 · Priority: med · Covers: FR-122 · Depends on: none · Parallel-safe: yes
Risk: med · Review lenses: code-integrity-reviewer, security-auditor · Specs: none

## Goal
Send downloaded attachments with the name the uploader gave them, without letting that name break the response header or point outside the download.

## Context (self-contained)
Node 20, ESM, no dependencies. Source under `src/`, tests under `test/` run with `node --test test/`.
`src/downloads.mjs` exports `DEFAULT_TYPE`. Filenames come from uploaders and are untrusted: they may hold directory parts (`C:\Users\x\report.pdf`, `../../a.txt`), quotes, control characters including CR and LF, and any Unicode. The value goes into a `Content-Disposition` response header.

## Acceptance criteria (testable)
- [ ] `contentDisposition(filename)` returns `attachment; filename="<ascii>"; filename*=UTF-8''<encoded>`.
- [ ] The name used is the part after the last `/` or `\`, with control characters (U+0000–U+001F, U+007F) removed and surrounding spaces trimmed; when nothing is left it is `download`.
- [ ] `<ascii>` is that name with every character outside printable ASCII, and every `"` and `\`, replaced by `_`.
- [ ] `<encoded>` is that name percent-encoded as UTF-8 per RFC 5987: `encodeURIComponent`, plus `'`, `(`, `)` and `*` escaped; lone surrogates are replaced by U+FFFD first.

## Out of scope
- Choosing the content type.

## Verification
- Prove done with: `node --test test/`
