import fs from 'node:fs';
import crypto from 'node:crypto';

const PROJECTIONS='data/runtime/projections.json';
const OUTCOMES='data/runtime/verified-outcomes.json';
const CONTESTS='data/runtime/political-contests.json';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const stable=v=>{
  if(Array.isArray(v)) return v.map(stable);
  if(v&&typeof v==='object') return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));
  return v;
};
const same=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));

const ledger=read(PROJECTIONS);
const outcomes=read(OUTCOMES);
const contests=read(CONTESTS);
const verifiedByContest=new Map();
for(const o of outcomes.outcomes||[]){
  if(o.verification_state!=='VERIFIED') continue;
  const prev=verifiedByContest.get(o.contest_id);
  if(!prev||Date.parse(o.recorded_at)>Date.parse(prev.recorded_at)) verifiedByContest.set(o.contest_id,o);
}
const now=new Date().toISOString();
let gradedCount=0;

function preOutcomePayload(p){
  return {
    projection_id:p.projection_id,
    contest_id:p.contest_id,
    cycle_id:p.cycle_id,
    projected_outcome:p.projected_outcome,
    probability:p.probability??null,
    confidence:p.confidence??null,
    created_at:p.created_at,
    evidence_cutoff:p.evidence_cutoff,
    source_snapshot_ids:p.source_snapshot_ids||[],
    intelligence_event_ids:p.intelligence_event_ids||[],
    analysis_lineage:p.analysis_lineage||[],
    comparison_baselines:p.comparison_baselines||[],
    grading_rule:p.grading_rule,
    model_version:p.model_version,
    rule_version:p.rule_version,
    prior_projection_id:p.prior_projection_id??null,
    revision_reason:p.revision_reason??null,
    projection_state_at_registration:p.integrity?.frozen_at?'FROZEN':'OPEN'
  };
}

for(const p of ledger.projections||[]){
  if(p.projection_state!=='FROZEN') continue;
  const outcome=verifiedByContest.get(p.contest_id);
  if(!outcome) continue;
  if(outcome.cycle_id!==p.cycle_id) throw new Error(`OUTCOME_CYCLE_MISMATCH ${p.projection_id}`);
  if(!p.integrity?.pre_outcome_payload_hash) throw new Error(`PRE_OUTCOME_HASH_MISSING ${p.projection_id}`);
  const actualHash=hash(preOutcomePayload(p));
  if(actualHash!==p.integrity.pre_outcome_payload_hash) throw new Error(`FROZEN_PROJECTION_MUTATED ${p.projection_id}`);
  if(p.grading_rule?.type!=='EXACT_JSON') throw new Error(`UNSUPPORTED_GRADING_RULE ${p.projection_id}`);
  const grade=same(p.projected_outcome,outcome.outcome)?'CORRECT':'INCORRECT';
  p.projection_state='GRADED';
  p.verified_outcome_id=outcome.outcome_id;
  p.grade=grade;
  p.graded_at=now;
  p.failure_audit_state=grade==='INCORRECT'?'REQUIRED_PENDING':null;
  p.integrity={
    ...p.integrity,
    pre_outcome_payload_hash_verified_at_grading:true,
    graded_pre_outcome_payload_hash:actualHash,
    post_outcome_metadata_only:true
  };
  const contest=(contests.contests||[]).find(c=>c.contest_id===p.contest_id);
  if(contest){
    contest.verified_outcome_id=outcome.outcome_id;
    contest.updated_at=now;
  }
  gradedCount++;
}

if(gradedCount){
  ledger.updated_at=now;
  ledger.rules ||= {};
  ledger.rules.grading_requires_verified_outcome=true;
  ledger.rules.pre_outcome_payload_hash_must_verify_before_grading=true;
  ledger.rules.incorrect_projection_requires_failure_audit=true;
  ledger.rules.post_outcome_updates_are_metadata_only=true;
  contests.updated_at=now;
  write(PROJECTIONS,ledger);
  write(CONTESTS,contests);
}
console.log(`VERIFIED_PROJECTIONS_GRADED count=${gradedCount}`);
