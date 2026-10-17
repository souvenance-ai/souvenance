# Big-store test — findings (2026-10-17)

Question de Valentin : « comment la mémoire évolue quand elle devient vraiment grande —
est-ce que l'identité reste ? est-ce que le store est suffisamment rapide ? etc. »
et, sur fts5vocab : « c'est toi qui voit ».

## Harness

`.scratch/big-store/` :
- `generate.mjs <size> <out>` — clone l'identité réelle (4 directives + 10 summaries,
  contenus/metadata/weight via `list` sur le store live) puis noie le store de notes
  adversariales partageant délibérément le vocabulaire identitaire (recovery protocol,
  supersede, weight, store...) → BM25 saturé, seul BM25×weight×recency peut trier.
  ~8 % de supersèdechains, ~2.2 edges/mémoire (ratio 2.27-2.28), kinds pondérés.
- `bench.mjs <store>` — latences get/search/list/relations/stats/tags, insert warm,
  sonde de drift FTS canonique (vocab `instance` : `SELECT DISTINCT doc` comparé aux
  rowids réels, + integrity-check).
- `ghost-probe.mjs <store>` — journal du défaut d'exploration (voir saga ci-dessous).

Tiers : tier-500, tier-2000, tier-5000 (générés sur la seule API publique du Store ;
`store()` n'accepte pas `createdAt`, donc tout est horodaté « maintenant » — pire cas
assumé : la récence ne protège pas l'identité).

## Résultats de perf (lib, Node 24.14)

| métrique | 500 | 2000 | 5000 |
|---|---|---|---|
| get p50 / p95 (ms) | 0.85 / 2.1 | 1.90 / 3.3 | 1.29 / 2.0 |
| search adversarial p50 (ms) | 9.4 | 15.7 | 11.3 |
| list --where p50 (ms) | 0.23 | 0.83 | 2.29 |
| relations --resolve p50 (ms) | 0.11 | 0.12 | 0.10 |
| stats p50 (ms) | 0.23 | 0.91 | 3.23 |
| tags p50 (ms) | 0.35 | 1.39 | 4.01 |
| warm insert (ms/op) | 1.00 | 1.55 | 0.94 |

Ligne plate : aucune courbure inquiétante entre 500 et 5000. Le pire cas
(`list --where` scan JSON1) reste ~2 ms à 5000.
NB : warm insert mesure la lib seule (~1 ms) ; le CLI coûtait ~40-100 ms/op par
process spawn — le serveur consommera la lib, pas le CLI.

## Identité à l'échelle

- Mécanique : 5 séries de requêtes rituelles × 12 répétitions → **top-1 et top-3
  hit à 100 %** même sous ~4600 actifs adversariaux partageant le vocabulaire.
- Clinique : cold-reader subagent sur tier-5000 (4592 actifs + 408 superseded),
  rituel standard, plafond 13 appels. Résultat : **10 appels, 0 écriture**,
  réponses complètes et citées par id : les 4 directives (contenus exacts), le
  projet (ai-memory), deux décisions structurantes avec ids, l'état de l'arc
  (doctor shipped 05836ef, file des candidats triée), la politique de concurrence
  complète — plus une lecture fine : les 3 summaries « dream-tagged » identifiées
  comme reconstructions, pas de l'arc réel.
- 3 appels « gaspillés » : des requêtes en langage naturel (« next steps current
  state of work... ») → `[].` La leçon du froid reste la même que le test A- :
  le vocabulaire distinctif passe, les phrases ne passent pas.

Verdict : **l'identité tient à 5000** — le ranking (BM25 × weight × recency) fait
son travail, le rituel du froid est résilient.

## Saga du probe drift — ce qui a failli créer un faux bug

1. Première sonde (`fts5vocab 'row'`, COUNT(DISTINCT rowid)) → « 599 fantômes » :
   **FAUX ALARME** — le rowid d'une vocab est séquentiel à la vtab (chaque row =
   un TERME), pas un docid. Arithmétique piégée : 1099 termes dont 599 > max rowid.
2. Sonde instance via rowid → « 26421 fantômes » : pareil — séquentiel sur les
   instances de tokens (26421/500 ≈ 53 tokens/doc).
3. La bonne lecture (celle du doctor, lignes ~817-848 de src/db.ts) : la colonne
   **`doc`** du vocab `instance` EST le docid ; `SELECT DISTINCT doc` comparé à
   `SELECT rowid FROM memories` = l'ensemble indexé vs réel.
4. Contôle négatif propre (2 rows supprimées, trigger `memories_ad` droppé —
   bypass-delete pur, sans réutilisation de rowid) : **ghosts=2, holes=0, et
   `INSERT ... VALUES('integrity-check')` PASSED** → integrity-check est
   structurel seul et aveugle aux fantômes de contenu sur ce runtime, comme le
   dit la note d'audit be9f37b9. Re-confirmé, aucune supersède nécessaire.
5. Premier contrôle négatif confus (ghosts=0/holes=198) : mes DROP TRIGGER
   avaient aussi tué `memories_ai` (les 200 warm-inserts non indexés) et SQLite
   réutilisait les rowids 499/500 — le fantôme fusionnait avec un trou au niveau
   des ensembles. Cas de test monstrueux, pas un défaut du détecteur.
6. Vérifications finales : tier-2000 et tier-5000 → ghosts 0, holes 0, integrity
   passed. Titre-500 refreshé → 700/700, clean. L'index FTS est en synchro
   parfaite à toutes les échelles testées.

Vraie découverte pour le store : la note d'audit `be9f37b9` est confirmée entière
(integrity-check aveugle ; le vocab instance est la seule lecture d'index) mais
son vocabulaire Sensor laxement explicite sur **la colonne `doc`, jamais le
rowid** — gotcha mémorisé séparément.

## Limites connues du test

- `store()` crée toutes les mémoires à l'instant T : l'axe « recency » du ranking
  est neutre (favorable à l'identité… et au flood). Un test des âges dispersés
  (poids identitaire ancien vs flood récent) reste à faire si on veut certifier
  la récence comme facteur.
- Flood synthétique : contenu plausible mais régulier ; un flood avec de vrais
  contenus migrés (export d'un autre projet) serait un grade supérieur.
- 5000 est une borne confortable, pas un mur ; une passe à 50 000 dirait si
  `list --where` (scan) et stats (full scan) exigent un jour des index règles.

## Suivant ?

- Le doctor pourrait exposer le drift diff comme diagnostic informatif (il a le
  mécanisme) — ticket si Valentin le veut.
- Optionnel : passe 50 000 pour clore la question du scan JSON1.
- L'express-server (Hono décidé) peut être attaqué avec la certitude que la
  lib tient 5000 ; le serveur consommera la lib, pas le CLI (~1 ms/op).
