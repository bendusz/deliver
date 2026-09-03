# Store as a single JSON file
Type: decision · Status: current · Sources: docs/plan.md, docs/stories/S1-1-cli-skeleton.md, docs/stories/S1-2-add-and-list.md

## Context
`docs/plan.md` Architecture calls for one Python module, `todo.py`, with a store helper that reads
and writes `todos.json`, and no external dependencies. `docs/plan.md` Risks names JSON file
corruption from an interrupted write and mitigates it with write-then-rename. `docs/stories/S1-1-cli-skeleton.md`
Context fixes the shape at `{"todos": ["text", ...]}` and requires `load_store()` to return
`{"todos": []}` when `todos.json` is absent. `docs/stories/S1-2-add-and-list.md` acceptance
criteria require `add` to use write-then-rename.

## Decision
Persist todos as `{"todos": ["text", ...]}` in a single `todos.json` file in the working
directory, written with write-then-rename rather than an in-place write. This rules out a
database or any external dependency, and, per `docs/plan.md` Scope, rules out due dates,
priorities, editing, deletion, and sync for this project.

## Related
- [The todo store](../concepts/todo-store.md)
- [todo-cli delivery plan](../sources/plan.md)
