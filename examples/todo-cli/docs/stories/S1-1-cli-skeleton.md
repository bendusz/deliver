# S1-1: CLI skeleton and store
<!-- pm-meta: {"builder":"expert-builder","touches":["todo.py","test_todo.py"]} -->
Sprint: 1 · Priority: high · Covers: FR-001, AC-001 · Depends on: none · Parallel-safe: no
Risk: low · Review lenses: code-integrity-reviewer

## Goal
Stand up the `todo.py` entry point with an `argparse` CLI and a JSON store that reads an existing
`todos.json` or starts empty.

## Context (self-contained)
- New file `todo.py` at the project root. Python 3.10+, standard library only.
- The store lives in `todos.json` in the current directory, shaped `{"todos": ["text", ...]}`.
- Use `argparse` with two subcommands to be filled in S1-2, `add` and `list`. For now wire the
  parser and a `load_store()` and `save_store()` pair.
- Tests in `test_todo.py` using `pytest`.

## Acceptance criteria (testable)
- [ ] `python todo.py` exits 0 and prints usage when no subcommand is given.
- [ ] `load_store()` returns `{"todos": []}` when `todos.json` is absent.
- [ ] `save_store()` then `load_store()` round-trips data.

## Out of scope
- The actual add and list behaviour, which is S1-2.

## Verification
- Prove done with: `python -m pytest -q test_todo.py`

## Verification evidence
STATUS: PASS · gates: test PASS 2026-06-04 15:12, lint N/A, build N/A · inline verifier pass, no
durable report at this scale.
