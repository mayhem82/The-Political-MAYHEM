import fs from 'node:fs';
import crypto from 'node:crypto';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const fail=msg=>{throw new Error(msg)};
const asTime=(v,label)=>{const t=Date.parse(v);if(!Number.isFinite(t))fail(`${label} must be a valid date-time`);return t;};
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');

const projectionLedger=read('data/runtime/projections.json');
const snapshotLedger=read('data/runtime/source-snapshots.json');
const eventLedger=read('data/runtime/intelligence-events.json');
const outcomeLedger=read('data/runtime/verified-outcomes.json');
const auditLedger=read('data/runtime/projection-audits.json');

if(projectionLedger.rules?.append_only!==true) fail('projection ledger must be append-only');
if(projectionLedger.rules?.frozen_projection_mutation_prohibited!==true) fail('frozen projection mutation must be prohibited');
if(projectionLedger.rules?.evidence_cutoff_required!==true) fail('evidence cutoff must be required');
if(projectionLedger.rules?.source_lineage_required!==true) fail('source lineage must be required');
if(projectionLedger.rules?.failed_projections_retained!==true) fail('failed projections must be retained');

const projections=projectionLedger.projections||[];
const snapshots=new Map((snapshotLedger.snapshots||[]).map(x=>[x.snapshot_id,x]));
const events=new Map((eventLedger.events||[]).map(x=>[x.event_id,x]));
const outcomes=new Map((outcomeLedger.outcomes||[]).map(x=>[x.outcome_id,x]));
const auditsByProjection=new Map((auditLedger.audits||[]).map(x=>[x.projection_id,x]));
const byId=new Map();

for(const p of projections){
  if(!p.projection_id) fail('projection_id is required');
  if(byId.has(p.projection_id)) fail(`duplicate projection_id ${p.projection_id}`);
  byId.set(p.projection_id,p);
}

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

for(const p of projections){
  if(!p.contest_id) fail(`${p.projection_id}: contest_id is required`);
  if(!p.cycle_id) fail(`${p.projection_id}: cycle_id is required`);
  if(p.projected_outcome===undefined||p.projected_outcome===null) fail(`${p.projection_id}: projected_outcome is required`);
  if(p.grading_rule?.type!=='EXACT_JSON') fail(`${p.projection_id}: grading_rule must be precommitted as EXACT_JSON`);

  const created=asTime(p.created_at,`${p.projection_id}.created_at`);
  const cutoff=asTime(p.evidence_cutoff,`${p.projection_id}.evidence_cutoff`);
  if(cutoff>created) fail(`${p.projection_id}: evidence_cutoff cannot be later than created_at`);

  if(!['OPEN','FROZEN','GRADED'].includes(p.projection_state)) fail(`${p.projection_id}: invalid projection_state`);
  if(p.probability!=null&&(typeof p.probability!=='number'||p.probability<0||p.probability>1)) fail(`${p.projection_id}: probability out of range`);
  if(p.confidence!=null&&(typeof p.confidence!=='number'||p.confidence<0||p.confidence>100)) fail(`${p.projection_id}: confidence out of range`);
  if(['FROZEN','GRADED'].includes(p.projection_state)&&typeof p.probability!=='number') fail(`${p.projection_id}: frozen/graded tip lacks explicit probability`);

  if(!Array.isArray(p.source_snapshot_ids)||p.source_snapshot_ids.length===0) fail(`${p.projection_id}: at least one source_snapshot_id is required`);
  for(const id of p.source_snapshot_ids){
    const s=snapshots.get(id);
    if(!s) fail(`${p.projection_id}: unknown source snapshot ${id}`);
    if(asTime(s.captured_at,`${id}.captured_at`)>cutoff) fail(`${p.projection_id}: source snapshot ${id} was captured after evidence_cutoff`);
  }

  for(const id of(p.intelligence_event_ids||[])){
    const e=events.get(id);
    if(!e) fail(`${p.projection_id}: unknown intelligence event ${id}`);
    if(e.event_type==='SOURCE_CHANGED') fail(`${p.projection_id}: raw SOURCE_CHANGED event ${id} entered projection lineage`);
    if(asTime(e.captured_at,`${id}.captured_at`)>cutoff) fail(`${p.projection_id}: intelligence event ${id} was captured after evidence_cutoff`);
  }

  const baselines=Array.isArray(p.comparison_baselines)?p.comparison_baselines:[];
  if(baselines.filter(x=>x?.primary===true).length>1) fail(`${p.projection_id}: multiple primary comparison baselines`);
  const baselineIds=new Set();
  for(const b of baselines){
    if(!b.baseline_id||baselineIds.has(b.baseline_id)) fail(`${p.projection_id}: comparison baseline IDs must be present and unique`);
    baselineIds.add(b.baseline_id);
    if(!['MARKET','CONSENSUS','POLL','MODEL','BOOKMAKER','OTHER'].includes(b.baseline_type)) fail(`${p.projection_id}: invalid baseline type ${b.baseline_type}`);
    if(typeof b.probability!=='number'||b.probability<0||b.probability>1) fail(`${p.projection_id}: baseline probability out of range`);
    const captured=asTime(b.captured_at,`${p.projection_id}.${b.baseline_id}.captured_at`);
    if(captured>cutoff) fail(`${p.projection_id}: baseline ${b.baseline_id} postdates evidence cutoff`);
    if(!Array.isArray(b.source_snapshot_ids)||b.source_snapshot_ids.length===0) fail(`${p.projection_id}: baseline ${b.baseline_id} lacks source lineage`);
    for(const id of b.source_snapshot_ids){
      const s=snapshots.get(id);
      if(!s) fail(`${p.projection_id}: baseline ${b.baseline_id} references unknown snapshot ${id}`);
      if(asTime(s.captured_at,`${id}.captured_at`)>captured) fail(`${p.projection_id}: baseline ${b.baseline_id} uses snapshot captured after baseline time`);
    }
  }

  if(p.prior_projection_id){
    const prior=byId.get(p.prior_projection_id);
    if(!prior) fail(`${p.projection_id}: prior projection ${p.prior_projection_id} does not exist`);
    if(prior.contest_id!==p.contest_id||prior.cycle_id!==p.cycle_id) fail(`${p.projection_id}: revision must remain within the same contest and cycle`);
    if(asTime(prior.created_at,`${prior.projection_id}.created_at`)>=created) fail(`${p.projection_id}: revision must be later than its prior projection`);
    if(!p.revision_reason) fail(`${p.projection_id}: revision_reason is required when prior_projection_id is set`);
  }else if(p.revision_reason){
    fail(`${p.projection_id}: revision_reason requires prior_projection_id`);
  }

  if(p.integrity?.hindsight_changes_prohibited!==true) fail(`${p.projection_id}: hindsight_changes_prohibited must be true`);
  if(p.integrity?.retroactive_signal_backfill_prohibited!==true) fail(`${p.projection_id}: retroactive_signal_backfill_prohibited must be true`);
  if(p.integrity?.raw_source_change_lineage_prohibited!==true) fail(`${p.projection_id}: raw source change lineage prohibition missing`);
  if(!p.integrity?.pre_outcome_payload_hash) fail(`${p.projection_id}: pre-outcome payload hash missing`);
  const recomputed=hash(preOutcomePayload(p));
  if(recomputed!==p.integrity.pre_outcome_payload_hash) fail(`${p.projection_id}: pre-outcome payload hash mismatch`);

  if(p.projection_state==='FROZEN'||p.projection_state==='GRADED'){
    const frozen=asTime(p.integrity?.frozen_at,`${p.projection_id}.integrity.frozen_at`);
    if(frozen<created) fail(`${p.projection_id}: frozen_at cannot be earlier than created_at`);
  }

  if(p.projection_state==='GRADED'){
    if(!p.verified_outcome_id) fail(`${p.projection_id}: graded projection requires verified_outcome_id`);
    const outcome=outcomes.get(p.verified_outcome_id);
    if(!outcome) fail(`${p.projection_id}: verified outcome ${p.verified_outcome_id} does not exist`);
    if(outcome?.verification_state!=='VERIFIED') fail(`${p.projection_id}: grading outcome is not VERIFIED`);
    if(!['CORRECT','INCORRECT','PARTIAL','VOID'].includes(p.grade)) fail(`${p.projection_id}: graded projection requires a valid grade`);
    if(!p.graded_at) fail(`${p.projection_id}: graded_at is required`);
    if(p.grade==='INCORRECT'){
      if(!['REQUIRED_PENDING','COMPLETE'].includes(p.failure_audit_state)) fail(`${p.projection_id}: incorrect tip must expose failure audit state`);
      if(p.failure_audit_state==='COMPLETE'&&!auditsByProjection.has(p.projection_id)) fail(`${p.projection_id}: audit marked complete but no audit exists`);
    }
  }else if(p.grade!=null||p.verified_outcome_id!=null||p.graded_at!=null){
    fail(`${p.projection_id}: ungraded projection cannot carry grade/outcome/graded_at`);
  }
}

console.log(`PROJECTION_INTEGRITY_OK projections=${projections.length} snapshots=${snapshots.size} events=${events.size} outcomes=${outcomes.size} audits=${auditsByProjection.size}`);
