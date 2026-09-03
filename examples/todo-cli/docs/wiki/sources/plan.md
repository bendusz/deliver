# todo-cli delivery plan
Type: source · Status: current · Sources: docs/plan.md

## Summary
`docs/plan.md` Overview describes a tiny command-line tool that adds todos and lists them,
persisted to a local JSON file, built to demonstrate the pm-skill workflow end to end. Scope is
`todo add "<text>"` and `todo list` with JSON-file persistence in the working directory; due
dates, priorities, editing, deletion, and sync are out.

Architecture is a single Python module `todo.py` with an `argparse` CLI and a small store helper
that reads and writes `todos.json`, with no external dependencies.

Stories are S1-1, CLI skeleton and store, covering FR-001 and AC-001, and S1-2, add and list
todos, covering FR-002 and AC-002 and depending on S1-1.

Risks names JSON file corruption if a write is interrupted, mitigated with write-then-rename.
Commands are test `python -m pytest -q` and run `python todo.py`, with lint and build not
applicable. The plan was signed off by bendusz on 2026-06-04.

## Related
- [Store as a single JSON file](../decisions/json-file-store.md)
- [The todo store](../concepts/todo-store.md)
