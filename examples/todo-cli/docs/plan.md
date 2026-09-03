# todo-cli delivery plan

## Overview
A tiny command-line tool to add todos and list them, persisted to a local JSON file. Built to
demonstrate the pm-skill workflow end to end.

## Source spec
- none, intent captured inline. The `FR-` and `AC-` ids below are the authoritative requirements.

## Delivery mode
- Scale: standard
- Checkpoint policy: sprint-level
- Autonomy: approve each sprint
- Instruction rules: none

## Goals
- Add a todo from the command line.
- List existing todos.

## Target users
- A developer who wants a minimal local todo list.

## Scope
**In:**
- `todo add "<text>"` and `todo list`.
- JSON-file persistence in the working directory.

**Out:**
- Due dates, priorities, editing, deletion, sync.

## Stories
| id | title | priority | covers | acceptance criteria | depends-on | [P] |
|------|----------------------|----------|----------------|--------------------------------------------|------------|-----|
| S1-1 | CLI skeleton and store | high | FR-001, AC-001 | `todo` runs; an empty store is created and read | none | no |
| S1-2 | add and list todos | high | FR-002, AC-002 | `add` appends; `list` prints them in order | S1-1 | no |

## Architecture
A single Python module `todo.py` with an `argparse` CLI and a small store helper that reads and
writes `todos.json`. No external dependencies.

## Traceability
| requirement | covered by | notes |
| --- | --- | --- |
| FR-001: the CLI runs and reads or creates an empty store | S1-1 | |
| AC-001: `python todo.py` exits 0 and prints usage with no subcommand | S1-1 | |
| FR-002: `add` appends a todo and `list` prints them in order | S1-2 | |
| AC-002: `todo list` prints `1. buy milk` for a store with one item | S1-2 | |

## Non-functional requirements
- No third-party packages; Python 3.10 or newer.

## Commands
- test: `python -m pytest -q`
- lint: `N/A`
- build: `N/A`
- run: `python todo.py`

## Risks
- JSON file corruption if a write is interrupted. Mitigate with write-then-rename.

## Clarifications
<!-- empty -->

## Sign-off
Approved by bendusz on 2026-06-04
