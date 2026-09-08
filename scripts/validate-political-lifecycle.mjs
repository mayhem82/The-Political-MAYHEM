import fs from 'node:fs';

const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const fail = m => { throw new Error(m); };
const validTime = (v, label) => {
  const n = Date.parse(v);
  if (!Number.isFinite(n)) fail(`${label} must be a valid date-time`);
  return n;
};
const validDate = (v, label) => {
  if (v == null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(`${v}T00:00:00Z`))) fail(`${label} must be YYYY-MM-DD`);
  return v;
};

const cycleLedger = read('data/runtime/political-cycles.json');
const contestLedger = read('data/runtime/political-contests.json');
const checkpointLedger = read('data/runtime/contest-checkpoints.json');
const projectionLedger = read('data/runtime/projections.json');
const outcomeLedger = read('data/runtime/verified-outcomes.json');

if (cycleLedger.rules?.registered_cycle_required_for_contest !== true) fail('cycle ledger must require registered cycles for contests');
if (contestLedger.rules?.registered_cycle_required !== true) fail('contest ledger must require registered cycles');
if (contestLedger.rules?.status_regression_prohibited !== true) fail('contest lifecycle status regression must be prohibited');
if (contestLedger.rules?.verified_outcome_required_for_verified_status !== true) fail('verified contest state must require verified outcome');
if (contestLedger.rules?.no_hindsight_reconstruction !== true) fail('contest ledger must prohibit hindsight reconstruction');

const cycles = new Map();
for (const c of cycleLedger.cycles || []) {
  if (!c.cycle_id) fail('cycle_id is required');
  if (cycles.has(c.cycle_id)) fail(`duplicate cycle_id ${c.cycle_id}`);
  if (!c.jurisdiction) fail(`${c.cycle_id}: jurisdiction is required`);
  if (!c.cycle_type) fail(`${c.cycle_id}: cycle_type is required`);
  if (!['PLANNED','ACTIVE','OUTCOME_RECONCILIATION','CLOSED'].includes(c.status)) fail(`${c.cycle_id}: invalid status`);
  validTime(c.created_at, `${c.cycle_id}.created_at`);
  const updated = validTime(c.updated_at, `${c.cycle_id}.updated_at`);
  if (updated < validTime(c.created_at, `${c.cycle_id}.created_at`)) fail(`${c.cycle_id}: updated_at before created_at`);
  validDate(c.start_date, `${c.cycle_id}.start_date`);
  validDate(c.end_date, `${c.cycle_id}.end_date`);
  if (c.start_date && c.end_date && c.end_date < c.start_date) fail(`${c.cycle_id}: end_date before start_date`);
  if (!Array.isArray(c.source_refs) || c.source_refs.length === 0) fail(`${c.cycle_id}: source_refs required`);
  if (!Array.isArray(c.contest_ids)) fail(`${c.cycle_id}: contest_ids must be an array`);
  cycles.set(c.cycle_id, c);
}

const projections = new Map((projectionLedger.projections || []).map(p => [p.projection_id, p]));
const outcomes = new Map((outcomeLedger.outcomes || []).map(o => [o.outcome_id, o]));
const contests = new Map();
for (const c of contestLedger.contests || []) {
  if (!c.contest_id) fail('contest_id is required');
  if (contests.has(c.contest_id)) fail(`duplicate contest_id ${c.contest_id}`);
  const cycle = cycles.get(c.cycle_id);
  if (!cycle) fail(`${c.contest_id}: unknown cycle_id ${c.cycle_id}`);
  if (!c.jurisdiction) fail(`${c.contest_id}: jurisdiction is required`);
  if (c.jurisdiction !== cycle.jurisdiction) fail(`${c.contest_id}: contest jurisdiction must match cycle jurisdiction`);
  if (!c.contest_type) fail(`${c.contest_id}: contest_type is required`);
  if (!['UPCOMING','CONTEST_WINDOW','OUTCOME_VERIFICATION_PENDING','VERIFIED_OUTCOME'].includes(c.status)) fail(`${c.contest_id}: invalid status`);
  validTime(c.created_at, `${c.contest_id}.created_at`);
  const updated = validTime(c.updated_at, `${c.contest_id}.updated_at`);
  if (updated < validTime(c.created_at, `${c.contest_id}.created_at`)) fail(`${c.contest_id}: updated_at before created_at`);
  if (c.scheduled_at != null) validTime(c.scheduled_at, `${c.contest_id}.scheduled_at`);
  if (c.evidence_cutoff != null) validTime(c.evidence_cutoff, `${c.contest_id}.evidence_cutoff`);
  if (!Array.isArray(c.source_refs) || c.source_refs.length === 0) fail(`${c.contest_id}: source_refs required`);
  if (!Array.isArray(c.party_ids) || !Array.isArray(c.actor_ids)) fail(`${c.contest_id}: party_ids and actor_ids must be arrays`);

  if (c.current_projection_id) {
    const p = projections.get(c.current_projection_id);
    if (!p) fail(`${c.contest_id}: current projection ${c.current_projection_id} not found`);
    if (p.contest_id !== c.contest_id || p.cycle_id !== c.cycle_id) fail(`${c.contest_id}: current projection belongs to a different contest or cycle`);
  }
  if (c.verified_outcome_id) {
    const o = outcomes.get(c.verified_outcome_id);
    if (!o) fail(`${c.contest_id}: verified outcome ${c.verified_outcome_id} not found`);
    if (o.contest_id !== c.contest_id || o.cycle_id !== c.cycle_id) fail(`${c.contest_id}: verified outcome belongs to a different contest or cycle`);
    if (c.status === 'VERIFIED_OUTCOME' && o.verification_state !== 'VERIFIED') fail(`${c.contest_id}: VERIFIED_OUTCOME requires verification_state VERIFIED`);
  } else if (c.status === 'VERIFIED_OUTCOME') {
    fail(`${c.contest_id}: VERIFIED_OUTCOME requires verified_outcome_id`);
  }
  contests.set(c.contest_id, c);
}

for (const cycle of cycles.values()) {
  const listed = new Set(cycle.contest_ids || []);
  for (const id of listed) {
    const contest = contests.get(id);
    if (!contest) fail(`${cycle.cycle_id}: contest_ids references unknown contest ${id}`);
    if (contest.cycle_id !== cycle.cycle_id) fail(`${cycle.cycle_id}: contest ${id} belongs to different cycle`);
  }
  for (const contest of contests.values()) {
    if (contest.cycle_id === cycle.cycle_id && !listed.has(contest.contest_id)) fail(`${cycle.cycle_id}: missing contest ${contest.contest_id} from contest_ids`);
  }
}

for (const cpContest of checkpointLedger.contests || []) {
  const contest = contests.get(cpContest.contest_id);
  if (!contest) fail(`checkpoint ledger references unknown contest ${cpContest.contest_id}`);
  if (cpContest.cycle_id && cpContest.cycle_id !== contest.cycle_id) fail(`${cpContest.contest_id}: checkpoint cycle mismatch`);
}

for (const p of projections.values()) {
  const contest = contests.get(p.contest_id);
  if (!contest) fail(`${p.projection_id}: projection references unregistered contest ${p.contest_id}`);
  if (contest.cycle_id !== p.cycle_id) fail(`${p.projection_id}: projection cycle does not match registered contest`);
}
for (const o of outcomes.values()) {
  const contest = contests.get(o.contest_id);
  if (!contest) fail(`${o.outcome_id}: outcome references unregistered contest ${o.contest_id}`);
  if (contest.cycle_id !== o.cycle_id) fail(`${o.outcome_id}: outcome cycle does not match registered contest`);
}

console.log(`POLITICAL_LIFECYCLE_INTEGRITY_OK cycles=${cycles.size} contests=${contests.size} checkpoints=${(checkpointLedger.contests||[]).length} projections=${projections.size} outcomes=${outcomes.size}`);
