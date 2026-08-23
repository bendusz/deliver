#!/usr/bin/env bash
# pm-skill SessionStart hook — inject a tiny resume pointer when the project is PM-managed.
#
# Fires on startup, resume, /clear, and post-compaction (SessionStart source=compact); stdout
# becomes context for the new session. Multi-actor aware: prints the shared project position,
# YOUR actor position (identity from git config), and teammates as read-only one-liners.
# Stays completely SILENT (exit 0, no output) in any project that is not PM-managed.
#
# Fail-open: kill switch, missing state, no jq, or no git all degrade gracefully.
set -u

[ "${PM_SKILL_NO_ENFORCE:-}" = "1" ] && exit 0

input="$(cat)"
cwd="$PWD"
if command -v jq >/dev/null 2>&1; then
  c="$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)"
  [ -n "$c" ] && cwd="$c"
fi

# Resolve the PROJECT root (CLAUDE_PROJECT_DIR → git top level → cwd) so a
# session started in a subdirectory still finds pm/. Missing lib -> stay silent
# on root discovery but keep the plain-cwd behavior.
libdir="$(cd "$(dirname "$0")" 2>/dev/null && pwd)"
if [ -n "$libdir" ] && [ -f "$libdir/lib.sh" ]; then
  # shellcheck source=lib.sh disable=SC1091
  . "$libdir/lib.sh"
  cwd="$(pm_root "$cwd")"
fi

# PM-managed? Tracked pm/ first; legacy pre-0.8 tmp/ as fallback.
state="$cwd/pm/pm-state.json"
if [ ! -f "$state" ]; then
  if [ -f "$cwd/tmp/pm-state.json" ]; then
    echo "pm-skill: PM-managed project with state in the legacy tmp/ location."
    echo "Run /pm-skill:resume to migrate it to the tracked pm/ directory and continue."
  fi
  exit 0
fi

echo "pm-skill: this is a PM-managed project (pm/pm-state.json present)."

if ! command -v jq >/dev/null 2>&1 || ! jq empty "$state" 2>/dev/null; then
  echo "To continue: run /pm-skill:resume (or read the pm/ files directly)."
  exit 0
fi

# Shared project position. NB: signed_off is a boolean — jq's // treats false as empty.
jq -r '"project: phase=\(.phase // "?") sprint=\(.current_sprint // "-")/\(.total_sprints // "-") signed_off=\(if .signed_off == null then "?" else .signed_off end)"' "$state" 2>/dev/null

if [ ! -d "$cwd/pm/actors" ]; then
  # Legacy flat 0.8 layout — one summary line, then the migration hint.
  jq -r '"you: story=\(.current_story // "-") status=\(.current_story_status // "-") builder=\(.resolved_builder // "-") next=\(.next // "?")"' "$state" 2>/dev/null
  echo "Layout is flat single-actor (pre-0.9) — /pm-skill:resume migrates it to pm/actors/."
  echo "To continue: run /pm-skill:resume (or read the pm/ files directly). Before ending a long session, offer /pm-skill:handoff."
  exit 0
fi

# Derive our actor id: slug of the FULL git user.email (globally unique),
# else user.name — shared derivation in lib.sh.
me=""
if command -v pm_actor_id >/dev/null 2>&1; then
  me="$(pm_actor_id "$cwd")" || me=""
fi
# Documented last-resort fallback (see logging-and-state.md): no derivable identity
# still gets a stable id, so pm/actors/unknown-actor.json is treated as OUR file.
[ -n "$me" ] || me="unknown-actor"

if [ -n "$me" ] && [ -f "$cwd/pm/actors/$me.json" ] && jq empty "$cwd/pm/actors/$me.json" 2>/dev/null; then
  my="$cwd/pm/actors/$me.json"
  jq -r '"you (\(.actor // "?")): story=\(.current_story // "-") status=\(.current_story_status // "-") builder=\(.resolved_builder // "-") branch=\(.branch // "-") next=\(.next // "?")"' "$my" 2>/dev/null
  # Handoff freshness: timestamps are "YYYY-MM-DD HH:MM", so string comparison is safe.
  hw="$(jq -r '.handoff_written // empty' "$my" 2>/dev/null)"
  up="$(jq -r '.updated // empty' "$my" 2>/dev/null)"
  if [ -f "$cwd/pm/actors/$me.HANDOFF.md" ] && [ -n "$hw" ]; then
    if [ -n "$up" ] && [ "$up" \> "$hw" ]; then
      echo "Your pm/actors/$me.HANDOFF.md is STALE (state moved on) — trust the state files + log."
    else
      echo "A current pm/actors/$me.HANDOFF.md briefing exists — read it first; it replaces re-discovery."
    fi
  fi
elif [ -n "$me" ]; then
  echo "No actor file for you ($me) yet — /pm-skill:resume creates pm/actors/$me.json."
fi

# Teammates, read-only one-liners.
for f in "$cwd"/pm/actors/*.json; do
  [ -f "$f" ] || continue
  b="${f##*/}"; other="${b%.json}"
  [ "$other" = "$me" ] && continue
  jq empty "$f" 2>/dev/null || continue
  jq -r '"teammate \(.actor // "'"$other"'"): story=\(.current_story // "-") status=\(.current_story_status // "-") branch=\(.branch // "-")"' "$f" 2>/dev/null
done

echo "To continue: run /pm-skill:resume (or read the pm/ files directly). Before ending a long session, offer /pm-skill:handoff."
exit 0
