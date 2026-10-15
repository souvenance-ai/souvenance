# Spec: Supersede/Merge Kind Inheritance

Successor construction (`supersede`, `merge`) must never silently produce an unclassifiable memory. Kind and tags are structural: the CLI's read rituals filter on `metadata->>'$.kind'`, so a kind-less successor disappears from the directives/decisions/summaries lists the recovery protocol loads. One ticket, library-level fix, data repair done at discovery time.

Origin: cold-reader re-test, 2026-10-15 (found directive `b3f1551c` invisible to the directives ritual since 12:11).
