# todo-cli

A minimal CLI to add and list todos, persisted to `todos.json`. Python 3.10+, standard library only.

## Commands
- Test: `python -m pytest -q`
- Lint: `N/A`
- Build: `N/A`
- Run: `python todo.py`

## Working here
- This project is delivered with the pm-skill plugin. Process rules live in that skill and are
  enforced by its hooks; do not restate them here.
- Delivery state lives in `pm/` and is git-tracked. Never edit another actor's
  `pm/actors/<id>.json`. `tmp/` is scratch and ignored.
- Never push to a remote without an explicit request.

## Layout
- `todo.py` — argparse CLI + JSON store (`load_store` / `save_store`).
- `test_todo.py` — pytest tests.
- `todos.json` — the store (created at runtime; gitignored).

## Conventions
- Standard library only. Write-then-rename for any file write.

## Gotchas
- Don't commit `todos.json` or `tmp/`.
