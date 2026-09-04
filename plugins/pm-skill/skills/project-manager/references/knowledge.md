# Knowledge (the project wiki)

On a `standard` or larger project, `docs/wiki/` holds the durable knowledge: an index, a schema,
and decision, concept, and source pages. The `librarian` agent is its only writer,
except for the PM's one-time scaffold of `schema.md` and `index.md`. Raw artifacts
under `docs/` stay authoritative; `pm/` state and `pm/log.md` are not wiki content.

## Ownership
- The librarian writes only under `docs/wiki/`, supersedes instead of deleting, and never runs git.
- Every new page follows `wiki-page.md.template`.
- You log one line per librarian dispatch in `pm/log.md` from its receipt, and commit wiki changes
  together with the work they describe.
- Scale: no wiki at `tiny` or `small`; on at `standard` and above; at `regulated` a clean `lint` is
  required before the completion report.

## Handoff points
| When | Dispatch |
|---|---|
| Scaffold, after sign-off | write `docs/wiki/schema.md` and `docs/wiki/index.md` from `wiki-schema.md.template` and `wiki-index.md.template` |
| Right after scaffold | `librarian ingest docs/spec.md docs/plan.md` plus `docs/constitution.md` when present and the sprint's `.sdd` files when a skeleton exists; plan decisions and risks become decision pages |
| After every research report | `librarian ingest docs/research/<file>` |
| Loop state 7, after a story ships | `librarian ingest docs/stories/<story>.md` plus its `docs/verification/` report when one exists and any `.sdd` the story changed |
| After `/pm-skill:correct-course` | `librarian ingest` over the revised artifacts; the librarian supersedes |
| Sprint boundary, and before the completion report | `librarian lint`; `technical-writer` receives `docs/wiki/index.md` for the completion report |

## Readers
- On resume, read `docs/wiki/index.md` after state and handoff, before any `docs/` scan.
- When the user asks what the project knows about something, dispatch `librarian query <question>`.
- Give `codebase-analyst` and `researcher` the index path as an input on a project with a wiki.

## Brownfield entry
On the first resume of a `standard` or larger project with no `docs/wiki/`, offer one backfill:
scaffold the two files, then `librarian ingest` over the existing raw artifacts. Never do it
unasked.
