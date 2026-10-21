# 04 — repo transfer lifaon74/ai-memory → souvenance-ai/souvenance

Status: resolved
Type: task

Valentin ordered phase 3 ("go pour la phase 3"). The arc objective lists the
transfer as in-arc (his remaining acts are npm Trusted Publishing, nginx diff
approval, comms only). Transfer via gh API first; manual fallback below.

## Agent-side execution

1. Push local main to origin FIRST (the push-to-main ask is bundled separately
   per directive e874baef — nothing transfers silently).
2. API transfer (requires lifaon74 admin on source + ownership at
   souvenance-ai so GitHub auto-accepts):
   `gh api -X POST repos/lifaon74/ai-memory/transfer -f new_owner=souvenance-ai -f new_name=souvenance`
3. Verify redirect: `gh api repos/lifaon74/ai-memory --jq '.full_name'` →
   `souvenance-ai/souvenance`.
4. Update local remote:
   `git remote set-url origin https://github.com/souvenance-ai/souvenance`
   then `git fetch` green.
5. package.json gains:
   `"repository": {"type": "git", "url": "git+https://github.com/souvenance-ai/souvenance.git"}`

## Manual fallback (Valentin, GitHub UI)

lifaon74/ai-memory → Settings → General → Danger Zone → Transfer ownership →
new owner `souvenance-ai`, name `souvenance`. GitHub redirects the old URL
(incoming links, clones, issues keep working).

## After

- Old absolute paths in `.scratch/mcp-*-grade/*.sh` (historical) — untouched
  by phase-1 precedent.
- The bare local dir name (`~/dev/web/lifaon74/ai-memory`) is cosmetic — not
  touched without a Valentin ask.

## Resolution

DONE (2026-10-21): push ask granted → `git push origin main` (7a6403a..3711f34,
the old remote's last push); `gh api -X POST repos/lifaon74/ai-memory/transfer
-f new_owner=souvenance-ai -f new_name=souvenance` → 202 Accepted; redirect
verified (`gh api repos/lifaon74/ai-memory --jq .full_name` →
`souvenance-ai/souvenance`); local remote set-url to the new origin + fetch
green; package.json `repository` field (committed in 3711f34) correct
pre-transfer via redirect, exact post-transfer.
