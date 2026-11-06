/**
 * One home per contract clause: the wire's /doc and the bridge's
 * tools/list teach the same strings — a clause edits once and both
 * renderings ride, so no copy can drift from the judge. The clauses
 * the two transports genuinely speak differently (the query's repeated
 * params, the URL-encoded metadata object, the presence flag) and the
 * gesture prose each rendering compresses stay with their own surface:
 * sharing them would teach an HTTP idiom to a JSON client.
 *
 * The ceilings interpolate from their owners (the limits family, the
 * store's summary ceiling — ADR 0005's one-schema-set verdict): a cap
 * change moves every rendering at once, and the bridge's declared
 * bounds cannot outlive the judge's.
 *
 * The sufficiency bar (#93) holds by construction: these strings are
 * served — engine-agnostic, no storage term, no issue or Q-ref.
 */
import { MAX_SUMMARY_LENGTH } from '../store/store.ts';

export const TEACHING = {
  memoryId: "the addressed memory's id",
  kindBirth: "the memory's kind — demanded at birth, a free vocabulary",
  kindSuccessor: "the successor's kind — rides along when absent, reclassifies when present",
  kindFusion: "the fusion's kind — when absent, the sources must agree on it",
  idsSources: 'the sources — at least two; they become one',
  summary: `the authored condensation — owed when the content runs past the ${MAX_SUMMARY_LENGTH}-character ceiling; the summary itself refuses past it; revised by supersede, never in place`,
  metadataAuthored:
    'keys are one path segment each (letters, digits, "-", "_"); values are scalars ' +
    '(string | number | boolean) or nested objects of them — arrays and null never author: ' +
    'the filter cannot ask for either',
  hotBirth:
    "the birth curation — the memory lands hot: the sub-state a fresh session's checkin serves",
  hotVerdict: 'the verdict — true lands the memory in the hot block, false cools it back to active',
  edgeTo: "the target memory's id — self-edges refuse",
  edgeKind: "the edge's kind — non-empty",
  edgeMetadata: 'free-form JSON — edges sit outside the filter reach',
  unlinkTo: "the edge's target",
  unlinkKind: "the edge's kind — needed when the edges are ambiguous",
  pageCursor: "the page cursor — hand back the previous page's next_after",
  searchText: 'the search text — non-empty',
  limitExplicit: "an explicit page size — past the cap refuses; absent takes the server's default",
  limitCheckin:
    'an explicit session block — integer ≥ 1, no ceiling; absent serves the whole hot block',
  depthProjection:
    'how deep the projection expands out-edges — absent serves depth 1 (raw edges); past the cap refuses',
} as const;
