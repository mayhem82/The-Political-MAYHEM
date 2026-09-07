import fs from 'node:fs';

const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const fail = [];
const assert = (condition, message) => { if (!condition) fail.push(message); };

const manifest = read('data/snapshot-manifest.json');
assert(manifest.integrity?.forward_first === true, 'forward_first invariant missing');
assert(manifest.integrity?.hindsight_changes_prohibited === true, 'hindsight prohibition missing');
assert(manifest.integrity?.retroactive_signal_backfill_prohibited === true, 'retroactive signal prohibition missing');
assert(manifest.integrity?.failed_projections_retained === true, 'failed projection retention missing');

for (const [name, entry] of Object.entries(manifest.canonical || {})) {
  assert(entry?.path && fs.existsSync(entry.path), `canonical dependency missing: ${name}`);
}
for (const [name, path] of Object.entries(manifest.runtime || {})) {
  assert(path && fs.existsSync(path), `runtime dependency missing: ${name}`);
}

const ingestion = read(manifest.runtime.ingestion_manifest);
assert(ingestion.mode === 'FORWARD_ONLY', 'ingestion mode is not FORWARD_ONLY');
assert(ingestion.rules?.evidence_must_be_knowable_at_capture_time === true, 'knowable-at-capture rule missing');
assert(ingestion.rules?.retroactive_insertion_into_prior_projection_prohibited === true, 'retroactive insertion prohibition missing');

const projections = read(manifest.runtime.projection_ledger);
assert(projections.rules?.append_only === true, 'projection ledger not append-only');
assert(projections.rules?.frozen_projection_mutation_prohibited === true, 'frozen projection mutation prohibition missing');
for (const p of projections.projections || []) {
  assert(p.projection_id, 'projection missing projection_id');
  assert(p.contest_id, `${p.projection_id || 'projection'} missing contest_id`);
  assert(p.evidence_cutoff, `${p.projection_id || 'projection'} missing evidence_cutoff`);
  assert(Array.isArray(p.source_snapshot_ids), `${p.projection_id || 'projection'} missing source lineage`);
  if (p.projection_state === 'FROZEN' || p.projection_state === 'GRADED') {
    assert(p.integrity?.hindsight_changes_prohibited === true, `${p.projection_id} frozen without hindsight prohibition`);
    assert(p.integrity?.retroactive_signal_backfill_prohibited === true, `${p.projection_id} frozen without retroactive backfill prohibition`);
    assert(p.integrity?.frozen_at, `${p.projection_id} frozen without frozen_at`);
  }
  if (p.prior_projection_id) {
    assert((projections.projections || []).some(x => x.projection_id === p.prior_projection_id), `${p.projection_id} references missing prior projection`);
  }
}

const checkpoints = read(manifest.runtime.checkpoint_ledger);
assert(checkpoints.rules?.no_reconstruction_after_outcome === true, 'checkpoint hindsight reconstruction prohibition missing');
for (const contest of checkpoints.contests || []) {
  for (const cp of contest.checkpoints || []) {
    if (cp.capture_state === 'CAPTURED_LATE_PRE_OUTCOME') {
      assert(cp.captured_at && cp.outcome_time, `${cp.checkpoint_id || 'checkpoint'} late capture lacks timing evidence`);
      if (cp.captured_at && cp.outcome_time) assert(Date.parse(cp.captured_at) < Date.parse(cp.outcome_time), `${cp.checkpoint_id} late capture occurred after outcome`);
    }
    if (cp.capture_state === 'MISSED_NOT_CAPTURED') assert(!cp.source_snapshot_ids?.length, `${cp.checkpoint_id || 'checkpoint'} reconstructed despite MISSED_NOT_CAPTURED`);
  }
}

const outcomes = read(manifest.runtime.outcome_ledger);
for (const o of outcomes.outcomes || []) {
  assert(o.outcome_id && o.contest_id, 'outcome missing identity');
  if (o.verification_state === 'VERIFIED') assert(Array.isArray(o.source_snapshot_ids) && o.source_snapshot_ids.length > 0, `${o.outcome_id} verified without source snapshot`);
}

const audits = read(manifest.runtime.audit_ledger);
assert(audits.rules?.append_only === true, 'audit ledger not append-only');
for (const a of audits.audits || []) {
  assert(a.pre_outcome_evidence_only === true, `${a.audit_id || 'audit'} permits post-outcome causation`);
  assert(a.integrity?.frozen_projection_unchanged === true, `${a.audit_id || 'audit'} does not preserve frozen projection`);
  assert(a.integrity?.no_hindsight_rewrite === true, `${a.audit_id || 'audit'} permits hindsight rewrite`);
}

if (fail.length) {
  console.error('POLITICAL_MAYHEM_FORWARD_INTEGRITY_FAILED');
  for (const message of fail) console.error('- ' + message);
  process.exit(1);
}

console.log('POLITICAL_MAYHEM_FORWARD_INTEGRITY_PASS', manifest.snapshot_id);
