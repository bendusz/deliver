# S1-2: add and list todos
<!-- pm-meta: {"builder":"expert-builder","touches":["todo.py","test_todo.py"]} -->
Sprint: 1 · Priority: high · Covers: FR-002, AC-002 · Depends on: S1-1 · Parallel-safe: no
Risk: low · Review lenses: code-integrity-reviewer · Specs: todo.sdd

## Goal
Implement the `add` and `list` subcommands on top of the S1-1 store.

## Context (self-contained)
- Extends `todo.py` from S1-1: `load_store`, `save_store`, and argparse with `add` and `list`.
- `add <text>` appends `text` to `todos` and saves, using write-then-rename for safety.
- `list` prints each todo on its own line, in insertion order, 1-indexed.

## Acceptance criteria (testable)
- [ ] `todo add "buy milk"` appends "buy milk" to `todos.json`. (todo.sdd: Done when 3)
- [ ] `todo list` prints `1. buy milk` for a store with one item. (todo.sdd: Done when 4)
- [ ] `add` uses write-then-rename so an interrupted write cannot corrupt the store.
      (todo.sdd: Done when 3)

## Out of scope
- Editing or deleting todos.

## Verification
- Prove done with: `python -m pytest -q test_todo.py`

## Verification evidence
