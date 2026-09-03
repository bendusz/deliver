# The todo store
Type: concept · Status: current · Sources: docs/plan.md, docs/stories/S1-1-cli-skeleton.md, docs/stories/S1-2-add-and-list.md

## Summary
The store is a `load_store()` and `save_store()` pair defined in `todo.py`
(`docs/plan.md` Architecture). `load_store()` returns `{"todos": []}` when `todos.json` does not
exist yet, and `save_store()` followed by `load_store()` round-trips the data
(`docs/stories/S1-1-cli-skeleton.md` acceptance criteria).

`add <text>` appends `text` to the `todos` list and calls `save_store()`, using write-then-rename
so an interrupted write cannot corrupt the file. `list` prints each entry on its own line, in
insertion order, numbered from 1, for example `1. buy milk` for a store with one item
(`docs/stories/S1-2-add-and-list.md` Context and acceptance criteria).

Run the CLI with `python todo.py` (`docs/plan.md` Commands). It needs no third-party packages and
targets Python 3.10 or newer (`docs/plan.md` Non-functional requirements).

## Related
- [Store as a single JSON file](../decisions/json-file-store.md)
- [todo-cli delivery plan](../sources/plan.md)
