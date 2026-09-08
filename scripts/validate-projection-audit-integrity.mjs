import fs from 'node:fs';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const fail=msg=>{throw new Error(msg)};
const asTime=(v,label)=>{const t=Date.parse(v);if(!Number.isFinite(t)) fail(`${label} must be a valid date-time`);return t;};
const arr=(v,label)=>{if(!Array.isArray(v)) fail(`${label} must be an array`);return v;};
const sameSet=(a,b)=>a.length===b.length&&a.every(x=>b.includes(x));
const noDuplicates=(values,label)=>{if(new Set(values).size!==values.length) fail(`${label} contains duplicates`);};

const auditLedger=read('data/runtime/projection-audits.json');
const projectionLedger=read('data/runtime/projections.json');
const snapshotLedger=read('data/runtime/source-snapshots.json');
const eventLedger=read('data/runtime/intelligence-events.json');
const outcomeLedger=read('data/runtime/verified-outcomes.json');

if(auditLedger.rules?.append_only!==true) fail('projection audit ledger must be append-only');
if(auditLedger.rules?.incorrect_projection_requires_failure_audit!==true) fail('incorrect projections must require failure audits');
if(auditLedger.rules?.retrospective_evidence_allowed_in_failure_causation!==true) fail('retrospective evidence must be allowed in failure causation');
if(auditLedger.rules?.evidence_timing_must_be_preserved!==true) fail('audit evidence timing must be preserved');
if(auditLedger.rules?.later_evidence_cannot_be_credited_to_frozen_projection!==true) fail('later evidence must not be credited to frozen projections');
if(auditLedger.rules?.frozen_projection_unchanged!==true) fail('frozen projections must remain unchanged');
if('pre_outcome_evidence_only_for_failure_causation' in (auditLedger.rules||{})) fail('obsolete pre-outcome-only audit rule is prohibited');

const projections=new Map((projectionLedger.projections||[]).map(x=>[x.projection_id,x]));
const snapshots=new Map((snapshotLedger.snapshots||[]).map(x=>[x.snapshot_id,x]));
const events=new Map((eventLedger.events||[]).map(x=>[x.event_id,x]));
const outcomes=new Map((outcomeLedger.outcomes||[]).map(x=>[x.outcome_id,x]));
const auditIds=new Set();
const auditedProjections=new Set();

const classify=(captured,freeze,outcome)=>captured<=freeze?'PRE_FREEZE':captured<=outcome?'POST_FREEZE':'POST_OUTCOME';

for(const a of auditLedger.audits||[]){
  if(!a.audit_id) fail('audit_id is required');
  if(auditIds.has(a.audit_id)) fail(`duplicate audit_id ${a.audit_id}`);
  auditIds.add(a.audit_id);
  if(!a.projection_id) fail(`${a.audit_id}: projection_id is required`);
  if(auditedProjections.has(a.projection_id)) fail(`${a.projection_id}: multiple projection audits are not allowed`);
  auditedProjections.add(a.projection_id);

  const p=projections.get(a.projection_id);
  if(!p) fail(`${a.audit_id}: unknown projection ${a.projection_id}`);
  if(p.projection_state!=='GRADED') fail(`${a.audit_id}: projection must be GRADED`);
  if(a.verified_outcome_id!==p.verified_outcome_id) fail(`${a.audit_id}: verified outcome does not match projection`);
  if(a.grade!==p.grade) fail(`${a.audit_id}: grade does not match projection`);
  const outcome=outcomes.get(a.verified_outcome_id);
  if(!outcome) fail(`${a.audit_id}: unknown verified outcome ${a.verified_outcome_id}`);
  if(outcome.verification_state!=='VERIFIED') fail(`${a.audit_id}: outcome is not VERIFIED`);

  if(a.counterfactual_changes_prohibited!==true) fail(`${a.audit_id}: counterfactual changes must be prohibited`);
  if(a.integrity?.frozen_projection_unchanged!==true) fail(`${a.audit_id}: frozen_projection_unchanged must be true`);
  if(a.integrity?.no_hindsight_rewrite!==true) fail(`${a.audit_id}: no_hindsight_rewrite must be true`);
  if(a.integrity?.audit_append_only!==true) fail(`${a.audit_id}: audit_append_only must be true`);
  if(a.integrity?.later_evidence_not_credited_to_frozen_projection!==true) fail(`${a.audit_id}: later evidence credit prohibition missing`);
  if('pre_outcome_evidence_only' in a) fail(`${a.audit_id}: obsolete pre_outcome_evidence_only field is prohibited`);

  const freeze=asTime(p.integrity?.frozen_at||p.evidence_cutoff,`${p.projection_id}.freeze time`);
  const outcomeTime=asTime(outcome.effective_at||outcome.recorded_at,`${outcome.outcome_id}.outcome time`);
  if(outcomeTime<freeze) fail(`${a.audit_id}: outcome predates projection freeze`);

  const t=a.evidence_timing;
  if(!t||typeof t!=='object') fail(`${a.audit_id}: evidence_timing is required`);
  const preSources=arr(t.pre_freeze_source_snapshot_ids,`${a.audit_id}.pre_freeze_source_snapshot_ids`);
  const preEvents=arr(t.pre_freeze_intelligence_event_ids,`${a.audit_id}.pre_freeze_intelligence_event_ids`);
  const postFreezeSources=arr(t.post_freeze_source_snapshot_ids,`${a.audit_id}.post_freeze_source_snapshot_ids`);
  const postFreezeEvents=arr(t.post_freeze_intelligence_event_ids,`${a.audit_id}.post_freeze_intelligence_event_ids`);
  const postOutcomeSources=arr(t.post_outcome_source_snapshot_ids,`${a.audit_id}.post_outcome_source_snapshot_ids`);
  const postOutcomeEvents=arr(t.post_outcome_intelligence_event_ids,`${a.audit_id}.post_outcome_intelligence_event_ids`);

  const allSources=[...preSources,...postFreezeSources,...postOutcomeSources];
  const allEvents=[...preEvents,...postFreezeEvents,...postOutcomeEvents];
  noDuplicates(allSources,`${a.audit_id}.timed source evidence`);
  noDuplicates(allEvents,`${a.audit_id}.timed event evidence`);

  const reviewedSources=arr(a.source_snapshot_ids_reviewed||[],`${a.audit_id}.source_snapshot_ids_reviewed`);
  const reviewedEvents=arr(a.intelligence_event_ids_reviewed||[],`${a.audit_id}.intelligence_event_ids_reviewed`);
  noDuplicates(reviewedSources,`${a.audit_id}.source_snapshot_ids_reviewed`);
  noDuplicates(reviewedEvents,`${a.audit_id}.intelligence_event_ids_reviewed`);
  if(!sameSet(allSources,reviewedSources)) fail(`${a.audit_id}: reviewed source set must equal timed source evidence set`);
  if(!sameSet(allEvents,reviewedEvents)) fail(`${a.audit_id}: reviewed event set must equal timed event evidence set`);

  for(const id of p.source_snapshot_ids||[]) if(!preSources.includes(id)) fail(`${a.audit_id}: frozen projection source ${id} must remain classified PRE_FREEZE`);
  for(const id of p.intelligence_event_ids||[]) if(!preEvents.includes(id)) fail(`${a.audit_id}: frozen projection event ${id} must remain classified PRE_FREEZE`);

  for(const id of allSources){
    const s=snapshots.get(id);
    if(!s) fail(`${a.audit_id}: unknown audit source snapshot ${id}`);
    const expected=classify(asTime(s.captured_at,`${id}.captured_at`),freeze,outcomeTime);
    const actual=preSources.includes(id)?'PRE_FREEZE':postFreezeSources.includes(id)?'POST_FREEZE':'POST_OUTCOME';
    if(actual!==expected) fail(`${a.audit_id}: source ${id} classified ${actual} but capture timing requires ${expected}`);
  }
  for(const id of allEvents){
    const e=events.get(id);
    if(!e) fail(`${a.audit_id}: unknown audit intelligence event ${id}`);
    const expected=classify(asTime(e.captured_at,`${id}.captured_at`),freeze,outcomeTime);
    const actual=preEvents.includes(id)?'PRE_FREEZE':postFreezeEvents.includes(id)?'POST_FREEZE':'POST_OUTCOME';
    if(actual!==expected) fail(`${a.audit_id}: event ${id} classified ${actual} but capture timing requires ${expected}`);
  }
}

console.log(`PROJECTION_AUDIT_INTEGRITY_OK audits=${(auditLedger.audits||[]).length} retrospectiveEvidenceAllowed=true`);
