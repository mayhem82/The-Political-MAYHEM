import fs from 'node:fs';

const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const fail = msg => { throw new Error(msg); };
const asTime = (v, label) => {
  const t = Date.parse(v);
  if (!Number.isFinite(t)) fail(`${label} must be a valid date-time`);
  return t;
};

const projectionLedger = read('data/runtime/projections.json');
const snapshotLedger = read('data/runtime/source-snapshots.json');
const eventLedger = read('data/runtime/intelligence-events.json');
const outcomeLedger = read('data/runtime/verified-outcomes.json');

if (projectionLedger.rules?.append_only !== true) fail('projection ledger must be append-only');
if (projectionLedger.rules?.frozen_projection_mutation_prohibited !== true) fail('frozen projection mutation must be prohibited');
if (projectionLedger.rules?.evidence_cutoff_required !== true) fail('evidence cutoff must be required');
if (projectionLedger.rules?.source_lineage_required !== true) fail('source lineage must be required');
if (projectionLedger.rules?.failed_projections_retained !== true) fail('failed projections must be retained');

const projections = projectionLedger.projections || [];
const snapshots = new Map((snapshotLedger.snapshots || []).map(x => [x.snapshot_id, x]));
const events = new Map((eventLedger.events || []).map(x => [x.event_id, x]));
const outcomes = new Map((outcomeLedger.outcomes || []).map(x => [x.outcome_id, x]));
const byId = new Map();

for (const p of projections) {
  if (!p.projection_id) fail('projection_id is required');
  if (byId.has(p.projection_id)) fail(`duplicate projection_id ${p.projection_id}`);
  byId.set(p.projection_id, p);
}

for (const p of projections) {
  if (!p.contest_id) fail(`${p.projection_id}: contest_id is required`);
  if (!p.cycle_id) fail(`${p.projection_id}: cycle_id is required`);
  if (p.projected_outcome === undefined || p.projected_outcome === null) fail(`${p.projection_id}: projected_outcome is required`);

  const created = asTime(p.created_at, `${p.projection_id}.created_at`);
  const cutoff = asTime(p.evidence_cutoff, `${p.projection_id}.evidence_cutoff`);
  if (cutoff > created) fail(`${p.projection_id}: evidence_cutoff cannot be later than created_at`);

  if (!['OPEN', 'FROZEN', 'GRADED'].includes(p.projection_state)) fail(`${p.projection_id}: invalid projection_state`);
  if (p.probability != null && (typeof p.probability !== 'number' || p.probability < 0 || p.probability > 1)) fail(`${p.projection_id}: probability out of range`);
  if (p.confidence != null && (typeof p.confidence !== 'number' || p.confidence < 0 || p.confidence > 100)) fail(`${p.projection_id}: confidence out of range`);

  if (!Array.isArray(p.source_snapshot_ids) || p.source_snapshot_ids.length === 0) fail(`${p.projection_id}: at least one source_snapshot_id is required`);
  for (const id of p.source_snapshot_ids) {
    const s = snapshots.get(id);
    if (!s) fail(`${p.projection_id}: unknown source snapshot ${id}`);
    if (asTime(s.captured_at, `${id}.captured_at`) > cutoff) fail(`${p.projection_id}: source snapshot ${id} was captured after evidence_cutoff`);
  }

  for (const id of (p.intelligence_event_ids || [])) {
    const e = events.get(id);
    if (!e) fail(`${p.projection_id}: unknown intelligence event ${id}`);
    if (asTime(e.captured_at, `${id}.captured_at`) > cutoff) fail(`${p.projection_id}: intelligence event ${id} was captured after evidence_cutoff`);
  }

  if (p.prior_projection_id) {
    const prior = byId.get(p.prior_projection_id);
    if (!prior) fail(`${p.projection_id}: prior projection ${p.prior_projection_id} does not exist`);
    if (prior.contest_id !== p.contest_id || prior.cycle_id !== p.cycle_id) fail(`${p.projection_id}: revision must remain within the same contest and cycle`);
    if (asTime(prior.created_at, `${prior.projection_id}.created_at`) >= created) fail(`${p.projection_id}: revision must be later than its prior projection`);
    if (!p.revision_reason) fail(`${p.projection_id}: revision_reason is required when prior_projection_id is set`);
  } else if (p.revision_reason) {
    fail(`${p.projection_id}: revision_reason requires prior_projection_id`);
  }

  if (p.integrity?.hindsight_changes_prohibited !== true) fail(`${p.projection_id}: hindsight_changes_prohibited must be true`);
  if (p.integrity?.retroactive_signal_backfill_prohibited !== true) fail(`${p.projection_id}: retroactive_signal_backfill_prohibited must be true`);

  if (p.projection_state === 'FROZEN' || p.projection_state === 'GRADED') {
    const frozen = asTime(p.integrity?.frozen_at, `${p.projection_id}.integrity.frozen_at`);
    if (frozen < created) fail(`${p.projection_id}: frozen_at cannot be earlier than created_at`);
  }

  if (p.projection_state === 'GRADED') {
    if (!p.verified_outcome_id) fail(`${p.projection_id}: graded projection requires verified_outcome_id`);
    if (!outcomes.has(p.verified_outcome_id)) fail(`${p.projection_id}: verified outcome ${p.verified_outcome_id} does not exist`);
    if (!['CORRECT', 'INCORRECT', 'PARTIAL', 'VOID'].includes(p.grade)) fail(`${p.projection_id}: graded projection requires a valid grade`);
  } else if (p.grade != null || p.verified_outcome_id != null) {
    fail(`${p.projection_id}: ungraded projection cannot carry grade or verified_outcome_id`);
  }
}

console.log(`PROJECTION_INTEGRITY_OK projections=${projections.length} snapshots=${snapshots.size} events=${events.size} outcomes=${outcomes.size}`);
