#!/usr/bin/env bash
# Portable validation for the pm-skill plugin — runs locally and in CI (no `claude` CLI needed).
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
         plugins/pm-skill/schemas/story-metadata.schema.json \
         plugins/pm-skill/schemas/builder-benchmark-result.schema.json \
         plugins/pm-skill/schemas/builder-routing-cases.schema.json \
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

# 4) skill + agent frontmatter must declare name + description
for md in plugins/pm-skill/skills/project-manager/SKILL.md plugins/pm-skill/agents/*.md; do
  [ -f "$md" ] || continue
  head -n 12 "$md" | grep -q '^name:' || err "no 'name:' frontmatter in $md"
  head -n 12 "$md" | grep -q '^description:' || err "no 'description:' frontmatter in $md"
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
[ -x plugins/pm-skill/scripts/score-builder-benchmark.sh ] || err "builder benchmark scorer is not executable"
[ -x scripts/smoke-codex-builder-live.sh ] || err "live Codex builder smoke test is not executable"
for f in plugins/pm-skill/scripts/codex/run.mjs plugins/pm-skill/scripts/codex/lib/*.mjs plugins/pm-skill/scripts/codex/modes/*.mjs plugins/pm-skill/scripts/codex/smoke-live.mjs; do
  node --check "$f" 2>/dev/null || err "runner file does not parse: $f"
done
grep -rlE '\b(jq|bash)\b' plugins/pm-skill/scripts/codex >/dev/null 2>&1 && err "bash or jq referenced under plugins/pm-skill/scripts/codex/"
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
  head -n 6 "$md" | grep -q '^description:' || err "no 'description:' frontmatter in $md"
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

# 13) agent frontmatter must be valid YAML — an unquoted plain scalar may not contain ': '
# (a colon+space mid-value turns the line into a nested mapping and breaks agent loading).
for md in plugins/pm-skill/agents/*.md plugins/pm-skill/skills/project-manager/SKILL.md; do
  [ -f "$md" ] || continue
  fm="$(awk 'NR==1 && $0!="---"{exit} /^---$/{n++; next} n==1{print} n==2{exit}' "$md")"
  [ -n "$fm" ] || { err "no frontmatter block in $md"; continue; }
  while IFS= read -r line; do
    case "$line" in
      [a-z]*': '*) ;;
      *) err "malformed frontmatter line in $md: ${line%%:*}"; continue ;;
    esac
    val="${line#*: }"
    case "$val" in
      \"*\"|\'*\') ;;  # quoted scalar — ': ' is fine inside quotes
      *': '*) err "unquoted ': ' inside frontmatter value in $md (invalid YAML plain scalar): key '${line%%:*}'" ;;
    esac
  done < <(printf '%s\n' "$fm")
  if command -v ruby >/dev/null 2>&1; then
    # shellcheck disable=SC2016  # $stdin is a Ruby global, not a shell expansion
    printf '%s\n' "$fm" | ruby -ryaml -e 'YAML.safe_load($stdin.read)' >/dev/null 2>&1 || \
      err "frontmatter fails strict YAML parse: $md"
  fi
done

# 14) Opus fleet defaults are deliberate and may not drift to a moving alias or excessive effort.
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
    head -n 12 "$md" | grep -q '^name:' || err "no 'name:' frontmatter in $md"
    head -n 12 "$md" | grep -q '^description:' || err "no 'description:' frontmatter in $md"
    fm="$(awk 'NR==1 && $0!="---"{exit} /^---$/{c++; next} c==1{print} c==2{exit}' "$md")"
    [ -n "$fm" ] || { err "no frontmatter block in $md"; continue; }
    while IFS= read -r line; do
      case "$line" in [a-z]*': '*) ;; *) err "malformed frontmatter line in $md: ${line%%:*}"; continue ;; esac
      val="${line#*: }"
      case "$val" in \"*\"|\'*\') ;; *': '*) err "unquoted ': ' inside frontmatter value in $md: key '${line%%:*}'" ;; esac
    done < <(printf '%s\n' "$fm")
    if command -v ruby >/dev/null 2>&1; then
      # shellcheck disable=SC2016
      printf '%s\n' "$fm" | ruby -ryaml -e 'YAML.safe_load($stdin.read)' >/dev/null 2>&1 || err "frontmatter fails strict YAML parse: $md"
    fi
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
if grep -n 'CLAUDE\.md' plugins/pm-skill/agents/*.md | grep -v 'AGENTS\.md' >/dev/null 2>&1; then
  grep -n 'CLAUDE\.md' plugins/pm-skill/agents/*.md | grep -v 'AGENTS\.md' >&2
  err "agent prompt names CLAUDE.md without AGENTS.md (see above)"
fi
for f in AGENTS.md CLAUDE.md examples/todo-cli/AGENTS.md examples/todo-cli/CLAUDE.md; do
  [ -f "$f" ] || err "dogfood file missing: $f"
done
[ "$(sed -n '1p' CLAUDE.md 2>/dev/null)" = "@AGENTS.md" ] || err "repo CLAUDE.md must be the @AGENTS.md bridge"

if [ "$fail" -eq 0 ]; then echo "validate.sh: OK"; else echo "validate.sh: FAILED" >&2; exit 1; fi
