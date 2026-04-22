# Project-Local Skills

Forge supports project-local overrides and additions under `.forge/skills`.

## Layout

```text
.forge/skills/
  skills/
    my-skill/
      skill.json
      instruction.md
  personas/
    my-persona/
      persona.json
  hooks/
    before-review.json
```

## Example Skill

```json
{
  "name": "project-review-skill",
  "description": "Project-local review guidance.",
  "version": "1.0.0",
  "phases": ["reviewing"],
  "triggers": [{ "type": "command", "value": "review" }],
  "requires": [],
  "verification": ["Review completed"],
  "assets": [{ "kind": "instruction", "path": "instruction.md", "required": true }]
}
```

## Example Persona

```json
{
  "name": "code-reviewer",
  "role": "executive",
  "recommended_for": ["review"],
  "prompt_overlay": "Prioritize correctness, tests, and regressions."
}
```

## Example Hook

```json
{
  "event": "before_review",
  "scope": "command",
  "action": "inject_message",
  "host_support": ["codex", "claude-code", "opencode"],
  "failure_policy": "warn",
  "message": "Check the release checklist before approving."
}
```

## How To Inspect

- `forge skills list`
- `forge skills explain <name>`
- `forge doctor`
