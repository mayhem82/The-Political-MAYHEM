import fs from 'node:fs';
import crypto from 'node:crypto';

const inputPath = process.argv[2];
if (!inputPath) throw new Error('usage: node scripts/register-forward-projection.mjs <projection-input.json>');

const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const write = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
const asTime = (v, label) => {
  const t = Date.parse(v);
  if (!Number.isFinite(t)) throw new Error(`${label} must be a valid date-time`);
  return t;
};
const compact = d => d.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const hash = v => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');

const ledgerPath = 'data/runtime/projections.json';
const snapshotsPath = 'data/runtime/source-snapshots.json';
const eventsPath = 'data/runtime/intelligence-events.json';

const ledger = read(ledgerPath);
const snapshots = new Map((read(snapshotsPath).snapshots || []).map(x => [x.snapshot_id, x]));
const events = new Map((read(eventsPath).events || []).map(x => [x.event_id, x]));
const input = read(inputPath);
const now = new Date();
const createdAt = now.toISOString();
const evidenceCutoff = input.evidence_cutoff || createdAt;
const cutoffMs = asTime(evidenceCutoff, 'evidence_cutoff');
if (cutoffMs > now.getTime()) throw new Error('evidence_cutoff cannot be in the future');

if (!input.contest_id) throw new Error('contest_id is required');
if (!input.cycle_id) throw new Error('cycle_id is required');
if (input.projected_outcome === undefined || input.projected_outcome === null) throw new Error('projected_outcome is required');
if (!Array.isArray(input.source_snapshot_ids) || input.source_snapshot_ids.length === 0) throw new Error('at least one source_snapshot_id is required');

for (const id of input.source_snapshot_ids) {
  const s = snapshots.get(id);
  if (!s) throw new Error(`unknown source snapshot ${id}`);
  if (asTime(s.captured_at, `${id}.captured_at`) > cutoffMs) throw new Error(`source snapshot ${id} was captured after evidence_cutoff`);
}
for (const id of (input.intelligence_event_ids || [])) {
  const e = events.get(id);
  if (!e) throw new Error(`unknown intelligence event ${id}`);
  if (asTime(e.captured_at, `${id}.captured_at`) > cutoffMs) throw new Error(`intelligence event ${id} was captured after evidence_cutoff`);
}

const existing = ledger.projections || [];
let prior = null;
if (input.prior_projection_id) {
  prior = existing.find(x => x.projection_id === input.prior_projection_id);
  if (!prior) throw new Error(`prior projection ${input.prior_projection_id} does not exist`);
  if (prior.contest_id !== input.contest_id || prior.cycle_id !== input.cycle_id) throw new Error('revision must remain within the same contest and cycle');
  if (!input.revision_reason) throw new Error('revision_reason is required when prior_projection_id is set');
}

const projectionId = input.projection_id || `POL-PROJ-${compact(now)}-${hash({contest_id:input.contest_id,cycle_id:input.cycle_id,projected_outcome:input.projected_outcome,evidenceCutoff}).slice(0,8).toUpperCase()}`;
if (existing.some(x => x.projection_id === projectionId)) throw new Error(`projection_id already exists: ${projectionId}`);

if (input.probability != null && (typeof input.probability !== 'number' || input.probability < 0 || input.probability > 1)) throw new Error('probability must be between 0 and 1');
if (input.confidence != null && (typeof input.confidence !== 'number' || input.confidence < 0 || input.confidence > 100)) throw new Error('confidence must be between 0 and 100');

const state = input.projection_state || 'FROZEN';
if (!['OPEN', 'FROZEN'].includes(state)) throw new Error('new forward projection state must be OPEN or FROZEN');

const projection = {
  projection_id: projectionId,
  contest_id: input.contest_id,
  cycle_id: input.cycle_id,
  projected_outcome: input.projected_outcome,
  probability: input.probability ?? null,
  confidence: input.confidence ?? null,
  created_at: createdAt,
  evidence_cutoff: evidenceCutoff,
  source_snapshot_ids: [...new Set(input.source_snapshot_ids)],
  intelligence_event_ids: [...new Set(input.intelligence_event_ids || [])],
  analysis_lineage: [...new Set(input.analysis_lineage || [])],
  model_version: input.model_version ?? 'POLITICAL-MAYHEM-FORWARD-001',
  rule_version: input.rule_version ?? 'FORWARD-FIRST-001',
  prior_projection_id: input.prior_projection_id ?? null,
  revision_reason: input.revision_reason ?? null,
  projection_state: state,
  verified_outcome_id: null,
  grade: null,
  post_outcome_audit_ref: null,
  integrity: {
    frozen_at: state === 'FROZEN' ? createdAt : null,
    hindsight_changes_prohibited: true,
    retroactive_signal_backfill_prohibited: true,
    registration_hash: hash({projectionId,input,createdAt,evidenceCutoff})
  }
};

ledger.projections ||= [];
ledger.projections.push(projection);
ledger.updated_at = createdAt;
write(ledgerPath, ledger);
console.log(`FORWARD_PROJECTION_REGISTERED ${projectionId} state=${state} sources=${projection.source_snapshot_ids.length} events=${projection.intelligence_event_ids.length}`);
