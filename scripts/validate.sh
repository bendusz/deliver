#!/usr/bin/env bash
# Portable validation for the pm-skill plugin. It runs locally and in CI without the claude CLI.
set -u
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root" || exit 2
fail=0
err(){ echo "FAIL: $*" >&2; fail=1; }

command -v jq >/dev/null 2>&1 || { echo "validate.sh: jq is required" >&2; exit 2; }
command -v node >/dev/null 2>&1 || { echo "validate.sh: node (20+) is required" >&2; exit 2; }
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 20 ? 0 : 1)' || { echo "validate.sh: node 20 or newer is required (found $(node --version))" >&2; exit 2; }

# 1) JSON validity
for f in .claude-plugin/marketplace.json \
         plugins/pm-skill/.claude-plugin/plugin.json \
         plugins/pm-skill/hooks/hooks.json \
         plugins/pm-skill/schemas/codex-builder-result.schema.json \
         plugins/pm-skill/schemas/builder-benchmark-result.schema.json \
         plugins/pm-skill/benchmarks/codex-builder-routing-cases.json; do
  if [ -f "$f" ]; then jq empty "$f" 2>/dev/null || err "invalid JSON: $f"; else err "missing: $f"; fi
done

# 2) every marketplace source resolves to a plugin dir with a manifest
while IFS= read -r src; do
  [ -d "$src" ] || err "marketplace source is not a directory: $src"
  [ -f "$src/.claude-plugin/plugin.json" ] || err "marketplace source has no plugin.json: $src"
done < <(jq -r '.plugins[].source' .claude-plugin/marketplace.json 2>/dev/null)

# 3) required files
for f in plugins/pm-skill/skills/project-manager/SKILL.md README.md LICENSE CHANGELOG.md; do
  [ -f "$f" ] || err "missing required file: $f"
done

# check_frontmatter <file> [required-key...] is the one frontmatter checker. The file opens
# with a --- block, every required key is present, each line is a plain `key: value`, and an
# unquoted value carries no ': ' (YAML would read that as a nested mapping, which breaks
# skill and agent loading). Ruby, when installed, confirms the block with a strict parse.
check_frontmatter() {
  local f fm key line val
  f="$1"; shift
  fm="$(awk 'NR==1 && $0!="---"{exit} /^---$/{n++; next} n==1{print} n==2{exit}' "$f")"
  [ -n "$fm" ] || { err "no frontmatter block in $f"; return; }
  for key in "$@"; do
    printf '%s\n' "$fm" | grep -q "^$key:" || err "no '$key:' frontmatter in $f"
  done
  while IFS= read -r line; do
    case "$line" in
      [a-z]*': '*) ;;
      *) err "malformed frontmatter line in $f: ${line%%:*}"; continue ;;
    esac
    val="${line#*: }"
    case "$val" in
      \"*\"|\'*\') ;;  # a quoted scalar may hold ': '
      *': '*) err "unquoted ': ' inside frontmatter value in $f (invalid YAML plain scalar): key '${line%%:*}'" ;;
    esac
  done < <(printf '%s\n' "$fm")
  if command -v ruby >/dev/null 2>&1; then
    # shellcheck disable=SC2016  # $stdin is a Ruby global, not a shell expansion
    printf '%s\n' "$fm" | ruby -ryaml -e 'YAML.safe_load($stdin.read)' >/dev/null 2>&1 || \
      err "frontmatter fails strict YAML parse: $f"
  fi
}

# 4) skill + agent frontmatter must declare name + description and parse as YAML
for md in plugins/pm-skill/skills/project-manager/SKILL.md plugins/pm-skill/agents/*.md; do
  [ -f "$md" ] || continue
  check_frontmatter "$md" name description
done

# 5) every bundled hook is valid Node ESM and no bash or jq survives under hooks/
for h in plugins/pm-skill/hooks/*.mjs; do
  node --check "$h" 2>/dev/null || err "hook does not parse: $h"
done
for h in plugins/pm-skill/hooks/*.sh; do
  [ -e "$h" ] || continue
  err "bash hook found under plugins/pm-skill/hooks/ (runtime must be Node only): $h"
done
grep -lE '\bjq\b' plugins/pm-skill/hooks/*.mjs >/dev/null 2>&1 && err "jq referenced under plugins/pm-skill/hooks/"
# shellcheck disable=SC2016  # the placeholder is matched as a literal string in hooks.json
node -e '
const fs=require("fs");
const root="plugins/pm-skill";
const h=JSON.parse(fs.readFileSync(root+"/hooks/hooks.json","utf8")).hooks;
let bad=0;
for (const ev of Object.values(h)) for (const m of ev) for (const e of m.hooks) {
  const p=(e.args||[])[0]; if(!p) continue;
  const f=p.replace("${CLAUDE_PLUGIN_ROOT}",root);
  if(!fs.existsSync(f)){console.error("hooks.json references a missing file: "+f);bad=1;}
}
process.exit(bad);
' || err "hooks.json references a missing hook script"
[ -x scripts/smoke-codex-builder-live.sh ] || err "live Codex builder smoke test is not executable"
for f in plugins/pm-skill/scripts/*.mjs plugins/pm-skill/scripts/codex/run.mjs plugins/pm-skill/scripts/codex/lib/*.mjs plugins/pm-skill/scripts/codex/modes/*.mjs plugins/pm-skill/scripts/codex/smoke-live.mjs; do
  node --check "$f" 2>/dev/null || err "runner file does not parse: $f"
done
grep -rlE '\b(jq|bash)\b' plugins/pm-skill/scripts/*.mjs plugins/pm-skill/scripts/codex >/dev/null 2>&1 && err "bash or jq referenced under plugins/pm-skill/scripts/ (runtime must be Node only)"
grep -rl -- '—' plugins/pm-skill/hooks plugins/pm-skill/scripts >/dev/null 2>&1 && err "em dash found in runtime code under plugins/pm-skill/hooks or scripts"
# No agent or command may call codex directly; only the runner does.
grep -rlE 'codex exec' plugins/pm-skill/agents plugins/pm-skill/commands >/dev/null 2>&1 && err "direct codex invocation found in an agent prompt (use the runner)"

# 6) the installed plugin must stay generic (no third-party *plugin* names).
# The OpenAI Codex CLI is an intentional, documented external dependency of the
# codex-review/codex-help commands, so bare 'codex' is allowed since v0.10.0.
if grep -riE 'superpowers|skill-codex' plugins/pm-skill/ >/dev/null 2>&1; then
  err "third-party plugin name found under plugins/pm-skill/ (keep the artifact generic)"
fi

# 7) every references/<x>.md named in SKILL.md exists
skill=plugins/pm-skill/skills/project-manager/SKILL.md
if [ -f "$skill" ]; then
  while IFS= read -r r; do
    [ -f "plugins/pm-skill/skills/project-manager/$r" ] || err "SKILL.md references missing file: $r"
  done < <(grep -oE 'references/[a-z0-9-]+\.md' "$skill" | sort -u)
fi

# 8) every *.template referenced (path or bare name) in skills/commands/agents exists
while IFS= read -r t; do
  [ -f "plugins/pm-skill/templates/$t" ] || err "referenced template missing: $t"
done < <(grep -rhoE '[A-Za-z0-9._-]+\.template' plugins/pm-skill/skills plugins/pm-skill/commands plugins/pm-skill/agents 2>/dev/null | sort -u)

# 9) every command has 'description:' frontmatter
for md in plugins/pm-skill/commands/*.md; do
  [ -f "$md" ] || continue
  check_frontmatter "$md" description
done

# 10) JSON templates parse
for f in plugins/pm-skill/templates/pm-state.json.template \
         plugins/pm-skill/templates/actor-state.json.template \
         plugins/pm-skill/templates/claude-settings-hardening.json.template; do
  [ -f "$f" ] && { jq empty "$f" 2>/dev/null || err "invalid JSON template: $f"; }
done

# 11) CHANGELOG top version matches plugin.json version
pv="$(jq -r '.version' plugins/pm-skill/.claude-plugin/plugin.json 2>/dev/null)"
cv="$(grep -m1 -oE '^## [0-9]+\.[0-9]+\.[0-9]+' CHANGELOG.md 2>/dev/null | awk '{print $2}')"
{ [ -n "$pv" ] && [ "$pv" = "$cv" ]; } || err "version mismatch: plugin.json=$pv CHANGELOG top=$cv"

# 12) keep the artifact generic and self-contained (no external jargon)
if grep -rnE '/speckit|\btmux\b|\bsockets?\b|\bPi\b' README.md plugins/pm-skill >/dev/null 2>&1; then
  err "forbidden reference (speckit/tmux/socket/Pi) found"
fi

# 13) (folded into check 4, which now runs check_frontmatter over agents and SKILL.md)

# 14) Every agent's shipped model and effort is deliberate and may not drift.
check_agent_regime() {
  agent="$1"
  expected_model="$2"
  expected_effort="$3"
  path="plugins/pm-skill/agents/$agent.md"
  actual_model="$(grep -m1 '^model:' "$path" 2>/dev/null | awk '{print $2}')"
  actual_effort="$(grep -m1 '^effort:' "$path" 2>/dev/null | awk '{print $2}')"
  [ "$actual_model" = "$expected_model" ] || \
    err "$agent model must be $expected_model, found ${actual_model:-missing}"
  [ "$actual_effort" = "$expected_effort" ] || \
    err "$agent effort must be $expected_effort, found ${actual_effort:-missing}"
}
check_agent_regime expert-builder claude-opus-5 high
check_agent_regime security-auditor claude-opus-5 high
check_agent_regime debugger claude-opus-5 high
check_agent_regime architecture-reviewer claude-opus-5 medium
check_agent_regime code-integrity-reviewer claude-opus-5 medium
check_agent_regime pm-verifier claude-opus-5 medium
check_agent_regime test-engineer claude-opus-5 medium
check_agent_regime codex-builder sonnet medium
check_agent_regime codex-reviewer sonnet medium
check_agent_regime codex-advisor sonnet medium
check_agent_regime codex-researcher sonnet medium
check_agent_regime codebase-analyst sonnet medium
check_agent_regime technical-writer sonnet medium
check_agent_regime researcher sonnet medium

for md in plugins/pm-skill/agents/*.md; do
  model="$(grep -m1 '^model:' "$md" 2>/dev/null | awk '{print $2}')"
  effort="$(grep -m1 '^effort:' "$md" 2>/dev/null | awk '{print $2}')"
  [ "$model" != "opus" ] || err "moving model alias is forbidden in $md"
  if [ "$model" = "claude-opus-5" ]; then
    case "$effort" in
      xhigh|max) err "Opus agent may not ship at $effort effort: $md" ;;
    esac
  fi
done

# 15) behavioral tests (quota-free; needs jq + git, both required above)
if ! node --test plugins/pm-skill/scripts/tests/lib.test.mjs plugins/pm-skill/scripts/tests/hooks.test.mjs >/dev/null 2>&1; then
  node --test plugins/pm-skill/scripts/tests/lib.test.mjs plugins/pm-skill/scripts/tests/hooks.test.mjs || true
  err "hook behavioral tests failed (node --test plugins/pm-skill/scripts/tests)"
fi
if ! node --test plugins/pm-skill/scripts/tests/codex-run.test.mjs >/dev/null 2>&1; then
  node --test plugins/pm-skill/scripts/tests/codex-run.test.mjs || true
  err "Codex runner tests failed (node --test plugins/pm-skill/scripts/tests/codex-run.test.mjs)"
fi
if ! bash "$(dirname "$0")/test-builder-benchmark.sh" >/dev/null 2>&1; then
  bash "$(dirname "$0")/test-builder-benchmark.sh" || true
  err "builder benchmark tests failed (scripts/test-builder-benchmark.sh)"
fi

# 16) poteto companion plugin (plugins/poteto): manifest, attribution, skills, no Cursor residue
pp=plugins/poteto
if [ -d "$pp" ]; then
  jq empty "$pp/.claude-plugin/plugin.json" 2>/dev/null || err "invalid JSON: $pp/.claude-plugin/plugin.json"
  [ "$(jq -r '.license' "$pp/.claude-plugin/plugin.json" 2>/dev/null)" = "MIT" ] || err "poteto plugin.json license must be MIT"
  for f in "$pp/LICENSE" "$pp/README.md" "$pp/PORT.md"; do [ -f "$f" ] || err "missing required file: $f"; done
  grep -q '^MIT License' "$pp/LICENSE" 2>/dev/null || err "poteto LICENSE is not the upstream MIT text"
  grep -q 'Lauren Tan' "$pp/LICENSE" 2>/dev/null || err "poteto LICENSE lost the copyright holder"
  n=0
  for md in "$pp"/skills/*/SKILL.md; do
    [ -f "$md" ] || continue
    n=$((n+1))
    check_frontmatter "$md" name description
  done
  want="$(grep -m1 -oE '^Skills bundled: [0-9]+' "$pp/PORT.md" 2>/dev/null | awk '{print $3}')"
  { [ -n "$want" ] && [ "$want" = "$n" ]; } || err "poteto skill count mismatch: PORT.md says '${want:-?}', found $n"
  if grep -rnE '\.cursor/|grok-4|sol-max|thinking-max|generalPurpose|pstack-models|agent-transcripts' "$pp/skills" >/dev/null 2>&1; then
    grep -rnE '\.cursor/|grok-4|sol-max|thinking-max|generalPurpose|pstack-models|agent-transcripts' "$pp/skills" | head -5 >&2
    err "Cursor-only string survived under $pp/skills (see above)"
  fi
fi

# 17) instructions layer: templates exist, the AGENTS.md template stays small, the bridge is exact,
#     and no agent prompt names CLAUDE.md without AGENTS.md on the same line.
for f in plugins/pm-skill/templates/AGENTS.md.template plugins/pm-skill/templates/CLAUDE.md.template \
         plugins/pm-skill/templates/rules-pm-state.md.template plugins/pm-skill/templates/pm-AGENTS.md.template; do
  [ -f "$f" ] || err "missing template: $f"
done
if [ -f plugins/pm-skill/templates/AGENTS.md.template ]; then
  n="$(wc -l < plugins/pm-skill/templates/AGENTS.md.template | tr -d '[:space:]')"
  [ "$n" -le 45 ] || err "AGENTS.md.template is $n lines; keep it at or under 45"
fi
if [ -f plugins/pm-skill/templates/CLAUDE.md.template ]; then
  [ "$(sed -n '1p' plugins/pm-skill/templates/CLAUDE.md.template)" = "@AGENTS.md" ] || err "CLAUDE.md.template must start with @AGENTS.md"
fi
# Scoped to agents/ and the worked example: commands and references legitimately discuss the
# CLAUDE.md bridge. The two-line bridge files hold no prose, and the example's frozen
# pm/log.md may keep its history, so neither is scanned.
bridge_scan() { grep -rn 'CLAUDE\.md' plugins/pm-skill/agents examples/todo-cli/docs examples/todo-cli/*.md 2>/dev/null | grep -v 'AGENTS\.md'; }
if bridge_scan >/dev/null 2>&1; then
  bridge_scan >&2
  err "an agent prompt or the worked example names CLAUDE.md without AGENTS.md (see above)"
fi
for f in AGENTS.md CLAUDE.md examples/todo-cli/AGENTS.md examples/todo-cli/CLAUDE.md; do
  [ -f "$f" ] || err "dogfood file missing: $f"
done
[ "$(sed -n '1p' CLAUDE.md 2>/dev/null)" = "@AGENTS.md" ] || err "repo CLAUDE.md must be the @AGENTS.md bridge"

if [ "$fail" -eq 0 ]; then echo "validate.sh: OK"; else echo "validate.sh: FAILED" >&2; exit 1; fi
