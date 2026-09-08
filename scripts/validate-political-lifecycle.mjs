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
const unique = (values, label) => {
  if (!Array.isArray(values)) fail(`${label} must be an array`);
  if (new Set(values).size !== values.length) fail(`${label} must not contain duplicates`);
  return values;
};

const cycleLedger = read('data/runtime/political-cycles.json');
const contestLedger = read('data/runtime/political-contests.json');
const checkpointLedger = read('data/runtime/contest-checkpoints.json');
const projectionLedger = read('data/runtime/projections.json');
const outcomeLedger = read('data/runtime/verified-outcomes.json');
const snapshotLedger = read('data/runtime/source-snapshots.json');
const eventLedger = read('data/runtime/intelligence-events.json');

if (cycleLedger.rules?.registered_cycle_required_for_contest !== true) fail('cycle ledger must require registered cycles for contests');
if (contestLedger.rules?.registered_cycle_required !== true) fail('contest ledger must require registered cycles');
if (contestLedger.rules?.status_regression_prohibited !== true) fail('contest lifecycle status regression must be prohibited');
if (contestLedger.rules?.verified_outcome_required_for_verified_status !== true) fail('verified contest state must require verified outcome');
if (contestLedger.rules?.no_hindsight_reconstruction !== true) fail('contest ledger must prohibit hindsight reconstruction');
if (checkpointLedger.rules?.no_reconstruction_after_outcome !== true) fail('checkpoint ledger must prohibit reconstruction after outcome');
if (checkpointLedger.rules?.checkpoint_evidence_cutoff_required !== true) fail('checkpoint ledger must require evidence cutoffs for captured checkpoints');

const snapshots = new Map();
for (const s of snapshotLedger.snapshots || []) {
  if (!s.snapshot_id) fail('source snapshot requires snapshot_id');
  if (snapshots.has(s.snapshot_id)) fail(`duplicate source snapshot ${s.snapshot_id}`);
  validTime(s.captured_at, `${s.snapshot_id}.captured_at`);
  snapshots.set(s.snapshot_id, s);
}
const events = new Map();
for (const e of eventLedger.events || []) {
  if (!e.event_id) fail('intelligence event requires event_id');
  if (events.has(e.event_id)) fail(`duplicate intelligence event ${e.event_id}`);
  validTime(e.captured_at, `${e.event_id}.captured_at`);
  events.set(e.event_id, e);
}

const projections = new Map();
for (const p of projectionLedger.projections || []) {
  if (!p.projection_id) fail('projection requires projection_id');
  if (projections.has(p.projection_id)) fail(`duplicate projection ${p.projection_id}`);
  projections.set(p.projection_id, p);
}
const outcomes = new Map();
for (const o of outcomeLedger.outcomes || []) {
  if (!o.outcome_id) fail('outcome requires outcome_id');
  if (outcomes.has(o.outcome_id)) fail(`duplicate outcome ${o.outcome_id}`);
  outcomes.set(o.outcome_id, o);
}

const cycles = new Map();
for (const c of cycleLedger.cycles || []) {
  if (!c.cycle_id) fail('cycle_id is required');
  if (cycles.has(c.cycle_id)) fail(`duplicate cycle_id ${c.cycle_id}`);
  if (!c.jurisdiction) fail(`${c.cycle_id}: jurisdiction is required`);
  if (!c.cycle_type) fail(`${c.cycle_id}: cycle_type is required`);
  if (!['PLANNED','ACTIVE','OUTCOME_RECONCILIATION','CLOSED'].includes(c.status)) fail(`${c.cycle_id}: invalid status`);
  const created = validTime(c.created_at, `${c.cycle_id}.created_at`);
  const updated = validTime(c.updated_at, `${c.cycle_id}.updated_at`);
  if (updated < created) fail(`${c.cycle_id}: updated_at before created_at`);
  validDate(c.start_date, `${c.cycle_id}.start_date`);
  validDate(c.end_date, `${c.cycle_id}.end_date`);
  if (c.start_date && c.end_date && c.end_date < c.start_date) fail(`${c.cycle_id}: end_date before start_date`);
  unique(c.contest_ids, `${c.cycle_id}.contest_ids`);
  const refs = unique(c.source_refs, `${c.cycle_id}.source_refs`);
  if (refs.length === 0) fail(`${c.cycle_id}: source_refs required`);
  for (const id of refs) {
    const s = snapshots.get(id);
    if (!s) fail(`${c.cycle_id}: unknown source snapshot ${id}`);
    if (validTime(s.captured_at, `${id}.captured_at`) > created) fail(`${c.cycle_id}: registration source ${id} was captured after cycle creation`);
  }
  cycles.set(c.cycle_id, c);
}

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
  const created = validTime(c.created_at, `${c.contest_id}.created_at`);
  const updated = validTime(c.updated_at, `${c.contest_id}.updated_at`);
  if (updated < created) fail(`${c.contest_id}: updated_at before created_at`);
  if (c.scheduled_at != null) validTime(c.scheduled_at, `${c.contest_id}.scheduled_at`);
  if (c.window_open_at != null) validTime(c.window_open_at, `${c.contest_id}.window_open_at`);
  if (c.close_at != null) validTime(c.close_at, `${c.contest_id}.close_at`);
  if (c.outcome_expected_at != null) validTime(c.outcome_expected_at, `${c.contest_id}.outcome_expected_at`);
  const cutoff = c.evidence_cutoff == null ? null : validTime(c.evidence_cutoff, `${c.contest_id}.evidence_cutoff`);
  const refs = unique(c.source_refs, `${c.contest_id}.source_refs`);
  if (refs.length === 0) fail(`${c.contest_id}: source_refs required`);
  unique(c.party_ids, `${c.contest_id}.party_ids`);
  unique(c.actor_ids, `${c.contest_id}.actor_ids`);
  for (const id of refs) {
    const s = snapshots.get(id);
    if (!s) fail(`${c.contest_id}: unknown source snapshot ${id}`);
    const captured = validTime(s.captured_at, `${id}.captured_at`);
    if (cutoff != null && captured > cutoff) fail(`${c.contest_id}: source snapshot ${id} was captured after contest evidence_cutoff`);
    if (captured > created) fail(`${c.contest_id}: registration source ${id} was captured after contest creation`);
  }

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

const checkpointIds = new Set();
const checkpointContestIds = new Set();
for (const cpContest of checkpointLedger.contests || []) {
  if (checkpointContestIds.has(cpContest.contest_id)) fail(`duplicate checkpoint contest entry ${cpContest.contest_id}`);
  checkpointContestIds.add(cpContest.contest_id);
  const contest = contests.get(cpContest.contest_id);
  if (!contest) fail(`checkpoint ledger references unknown contest ${cpContest.contest_id}`);
  if (cpContest.cycle_id && cpContest.cycle_id !== contest.cycle_id) fail(`${cpContest.contest_id}: checkpoint cycle mismatch`);
  if (cpContest.lifecycle && cpContest.lifecycle !== contest.status) fail(`${cpContest.contest_id}: checkpoint lifecycle ${cpContest.lifecycle} does not match contest status ${contest.status}`);

  for (const cp of cpContest.checkpoints || []) {
    if (!cp.checkpoint_id) fail(`${cpContest.contest_id}: checkpoint_id required`);
    if (checkpointIds.has(cp.checkpoint_id)) fail(`duplicate checkpoint_id ${cp.checkpoint_id}`);
    checkpointIds.add(cp.checkpoint_id);
    if (cp.contest_id !== contest.contest_id) fail(`${cp.checkpoint_id}: contest_id mismatch`);
    if (cp.cycle_id !== contest.cycle_id) fail(`${cp.checkpoint_id}: cycle_id mismatch`);
    if (!['BASELINE','PERIODIC','NOMINATION_CLOSE','CAMPAIGN_MILESTONE','POLL_RELEASE','DEBATE','PRE_POLL','T_7D','T_72H','T_24H','T_3H','POLL_CLOSE','POST_OUTCOME','OTHER'].includes(cp.checkpoint_type)) fail(`${cp.checkpoint_id}: invalid checkpoint_type`);
    if (!['PENDING','CAPTURED_IN_WINDOW','CAPTURED_LATE_PRE_OUTCOME','MISSED_NOT_CAPTURED','POST_OUTCOME_ONLY'].includes(cp.capture_state)) fail(`${cp.checkpoint_id}: invalid capture_state`);
    if (!['VERIFIED','UNVERIFIED','CONTRADICTED','MIXED','UNKNOWN'].includes(cp.evidence_state)) fail(`${cp.checkpoint_id}: invalid evidence_state`);
    if (!['NONE','OPEN','FROZEN','GRADED','ABSTAIN_INSUFFICIENT_EVIDENCE'].includes(cp.projection_state)) fail(`${cp.checkpoint_id}: invalid projection_state`);
    if (cp.scheduled_for != null) validTime(cp.scheduled_for, `${cp.checkpoint_id}.scheduled_for`);
    unique(cp.source_snapshot_ids, `${cp.checkpoint_id}.source_snapshot_ids`);
    unique(cp.intelligence_event_ids || [], `${cp.checkpoint_id}.intelligence_event_ids`);
    unique(cp.open_conflict_ids || [], `${cp.checkpoint_id}.open_conflict_ids`);
    if (cp.integrity?.hindsight_changes_prohibited !== true) fail(`${cp.checkpoint_id}: hindsight_changes_prohibited must be true`);
    if (cp.integrity?.retroactive_signal_backfill_prohibited !== true) fail(`${cp.checkpoint_id}: retroactive_signal_backfill_prohibited must be true`);

    if (cp.capture_state === 'PENDING') {
      if (cp.captured_at != null) fail(`${cp.checkpoint_id}: pending checkpoint cannot have captured_at`);
      if (cp.evidence_cutoff != null) fail(`${cp.checkpoint_id}: pending checkpoint cannot have evidence_cutoff`);
      if (cp.source_snapshot_ids.length !== 0) fail(`${cp.checkpoint_id}: pending checkpoint cannot have source snapshots`);
      if ((cp.intelligence_event_ids || []).length !== 0) fail(`${cp.checkpoint_id}: pending checkpoint cannot have intelligence events`);
      if (cp.integrity?.frozen_at != null) fail(`${cp.checkpoint_id}: pending checkpoint cannot have frozen_at`);
    } else if (cp.capture_state === 'MISSED_NOT_CAPTURED') {
      if (cp.captured_at != null) fail(`${cp.checkpoint_id}: missed checkpoint must remain uncaptured`);
      if (cp.evidence_cutoff != null) fail(`${cp.checkpoint_id}: missed checkpoint cannot have evidence_cutoff`);
      if (cp.source_snapshot_ids.length !== 0) fail(`${cp.checkpoint_id}: missed checkpoint cannot have source snapshots`);
      if ((cp.intelligence_event_ids || []).length !== 0) fail(`${cp.checkpoint_id}: missed checkpoint cannot have intelligence events`);
      validTime(cp.reconciled_at, `${cp.checkpoint_id}.reconciled_at`);
      validTime(cp.integrity?.frozen_at, `${cp.checkpoint_id}.integrity.frozen_at`);
    } else {
      const captured = validTime(cp.captured_at, `${cp.checkpoint_id}.captured_at`);
      const cutoff = validTime(cp.evidence_cutoff, `${cp.checkpoint_id}.evidence_cutoff`);
      if (cutoff > captured) fail(`${cp.checkpoint_id}: evidence_cutoff cannot be later than captured_at`);
      if (cp.source_snapshot_ids.length === 0) fail(`${cp.checkpoint_id}: captured checkpoint requires source snapshots`);
      for (const id of cp.source_snapshot_ids) {
        const s = snapshots.get(id);
        if (!s) fail(`${cp.checkpoint_id}: unknown source snapshot ${id}`);
        if (validTime(s.captured_at, `${id}.captured_at`) > cutoff) fail(`${cp.checkpoint_id}: source snapshot ${id} was captured after evidence_cutoff`);
      }
      for (const id of cp.intelligence_event_ids || []) {
        const e = events.get(id);
        if (!e) fail(`${cp.checkpoint_id}: unknown intelligence event ${id}`);
        if (validTime(e.captured_at, `${id}.captured_at`) > cutoff) fail(`${cp.checkpoint_id}: intelligence event ${id} was captured after evidence_cutoff`);
      }
      validTime(cp.integrity?.frozen_at, `${cp.checkpoint_id}.integrity.frozen_at`);
    }

    if (cp.projection_id) {
      const p = projections.get(cp.projection_id);
      if (!p) fail(`${cp.checkpoint_id}: projection ${cp.projection_id} not found`);
      if (p.contest_id !== contest.contest_id || p.cycle_id !== contest.cycle_id) fail(`${cp.checkpoint_id}: projection belongs to different contest or cycle`);
      if (cp.projection_state === 'NONE' || cp.projection_state === 'ABSTAIN_INSUFFICIENT_EVIDENCE') fail(`${cp.checkpoint_id}: ${cp.projection_state} cannot carry projection_id`);
      if (cp.projection_state !== p.projection_state) fail(`${cp.checkpoint_id}: projection_state does not match projection ledger state`);
    } else if (['OPEN','FROZEN','GRADED'].includes(cp.projection_state)) {
      fail(`${cp.checkpoint_id}: ${cp.projection_state} requires projection_id`);
    }
  }
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

console.log(`POLITICAL_LIFECYCLE_INTEGRITY_OK cycles=${cycles.size} contests=${contests.size} checkpoint_contests=${checkpointContestIds.size} checkpoints=${checkpointIds.size} projections=${projections.size} outcomes=${outcomes.size} snapshots=${snapshots.size} events=${events.size}`);
