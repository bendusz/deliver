# todo-cli

A minimal CLI to add and list todos, persisted to `todos.json`. Python 3.10+, standard library only.

## Commands
- Test: `python -m pytest -q`
- Lint: `N/A`
- Build: `N/A`
- Run: `python todo.py`

## Layout
- `todo.py`: the argparse CLI and JSON store (`load_store` and `save_store`).
- `test_todo.py`: pytest tests.
- `todos.json`: the store, created at runtime and gitignored.

## Conventions
- Standard library only. Write-then-rename for any file write.

## Gotchas
- Do not commit `todos.json` or `tmp/`.
