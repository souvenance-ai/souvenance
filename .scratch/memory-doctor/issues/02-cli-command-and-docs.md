# 02-cli-command-and-docs

Type: grilling
Status: resolved
Blocked by: 01

## Question

How does the CLI surface the doctor — name, flags, output format, exit code — and where is it documented, given that both agents and humans will run it?

Context: house convention is "stdout: JSON results, stderr: errors, exit 0 success / 1 on error". Every command returns JSON with no format flag. But `export` set the humans-only precedent (never referenced in SKILL.md). The doctor is different by design: the agent should run it routinely (dream step), so discoverability in SKILL.md matters.

## Answer

Command: `memory doctor [--fix]`. Global `--db` respected. Output: JSON `DoctorReport` via the standard `print()`. Exit code: `1` when `healthy` is false, `0` when clean — set after the standard close, not via `fail()` (findings are a successful diagnosis, not an error; stderr stays empty).

### Flags

- `--fix` (boolean): rebuilds the FTS5 index (`INSERT INTO memories_fts(memories_fts) VALUES('rebuild')`) on the live store before checking — the one mechanical repair, no content rewrite, compatible with the addition-only model. Wrapped in the BUSY retry. All other findings stay manual (supersede/merge are decisions, not automations).
- Added to `BOOLEAN_FLAGS` so it parses without swallowing the next argument.

### Report shape (stable contract)

```json
{
  "healthy": false,
  "findings": [{ "check": "weight_bounds", "id": "<uuid>", "detail": "…", "hint": "…" }],
  "summary": {
    "checks": 9, "issues": 2,
    "memories": 34, "edges": 86,
    "edges_by_kind": { "references": 80, "supersedes": 6 },
    "active_to_superseded": 13,
    "fts_rebuilt": false
  }
}
```

### Docs

- `bin/memory.js` HELP: command line + Notes entry.
- `SKILL.md`: command list + dream section line — "run doctor before dreaming; repair findings before dreaming".
- `README.md` command table: `doctor` row, plus the missing `export` row (pre-existing gap spotted while reading the table).

### Rationale

- **JSON, no format flag**: house convention covers both publics (agents parse; Valentin reads JSON daily). A `--pretty` would be the first exception ever.
- **Exit 1 on findings**: the machine-usable half of the contract — a script or CI can gate on it without parsing output. Distinct from `fail()` (which reports errors on stderr and exits 1): a diagnosis with findings is a *successful run*.
- **`fts_rebuilt` in summary**: makes `--fix` runs self-describing — the report states what it changed.

### Rejected

- **Human text default + `--json`**: breaks the uniform output convention for a marginal readability gain.
- **Exit 0 always**: kills the scriptability that makes the agent workflow (doctor → repair → dream) mechanical.
- **Human-only like `export`**: contradicts the grilling decision that the agent ritual uses it.
