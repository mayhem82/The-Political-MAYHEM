import fs from 'node:fs';
import crypto from 'node:crypto';

const inputPath=process.argv[2];
if(!inputPath) throw new Error('usage: node scripts/register-forward-projection.mjs <projection-input.json>');

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const asTime=(v,label)=>{const t=Date.parse(v);if(!Number.isFinite(t))throw new Error(`${label} must be a valid date-time`);return t;};
const compact=d=>d.toISOString().replace(/[-:.TZ]/g,'').slice(0,14);
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');

const ledgerPath='data/runtime/projections.json';
const contestLedgerPath='data/runtime/political-contests.json';
const snapshotsPath='data/runtime/source-snapshots.json';
const eventsPath='data/runtime/intelligence-events.json';

const ledger=read(ledgerPath);
const contestLedger=read(contestLedgerPath);
const snapshots=new Map((read(snapshotsPath).snapshots||[]).map(x=>[x.snapshot_id,x]));
const events=new Map((read(eventsPath).events||[]).map(x=>[x.event_id,x]));
const input=read(inputPath);
const now=new Date();
const createdAt=now.toISOString();
const evidenceCutoff=input.evidence_cutoff||createdAt;
const cutoffMs=asTime(evidenceCutoff,'evidence_cutoff');
if(cutoffMs>now.getTime()) throw new Error('evidence_cutoff cannot be in the future');

if(!input.contest_id) throw new Error('contest_id is required');
if(!input.cycle_id) throw new Error('cycle_id is required');
if(input.projected_outcome===undefined||input.projected_outcome===null) throw new Error('projected_outcome is required');
if(!Array.isArray(input.source_snapshot_ids)||input.source_snapshot_ids.length===0) throw new Error('at least one source_snapshot_id is required');

const contest=(contestLedger.contests||[]).find(x=>x.contest_id===input.contest_id);
if(!contest) throw new Error(`contest_id is not registered: ${input.contest_id}`);
if(contest.cycle_id!==input.cycle_id) throw new Error(`cycle_id ${input.cycle_id} does not match registered contest cycle ${contest.cycle_id}`);
if(!['UPCOMING','CONTEST_WINDOW'].includes(contest.status)) throw new Error(`contest ${input.contest_id} is not open for forward projection: ${contest.status}`);

for(const id of input.source_snapshot_ids){
  const s=snapshots.get(id);
  if(!s) throw new Error(`unknown source snapshot ${id}`);
  if(asTime(s.captured_at,`${id}.captured_at`)>cutoffMs) throw new Error(`source snapshot ${id} was captured after evidence_cutoff`);
}
for(const id of(input.intelligence_event_ids||[])){
  const e=events.get(id);
  if(!e) throw new Error(`unknown intelligence event ${id}`);
  if(e.event_type==='SOURCE_CHANGED') throw new Error(`raw SOURCE_CHANGED event ${id} cannot enter projection lineage; review and promote it first`);
  if(asTime(e.captured_at,`${id}.captured_at`)>cutoffMs) throw new Error(`intelligence event ${id} was captured after evidence_cutoff`);
}

const existing=ledger.projections||[];
if(input.prior_projection_id){
  const prior=existing.find(x=>x.projection_id===input.prior_projection_id);
  if(!prior) throw new Error(`prior projection ${input.prior_projection_id} does not exist`);
  if(prior.contest_id!==input.contest_id||prior.cycle_id!==input.cycle_id) throw new Error('revision must remain within the same contest and cycle');
  if(!input.revision_reason) throw new Error('revision_reason is required when prior_projection_id is set');
  if(contest.current_projection_id&&contest.current_projection_id!==input.prior_projection_id) throw new Error(`revision must descend from current projection ${contest.current_projection_id}`);
}else if(contest.current_projection_id){
  throw new Error(`contest ${input.contest_id} already has current projection ${contest.current_projection_id}; revision requires prior_projection_id`);
}

const projectionId=input.projection_id||`POL-PROJ-${compact(now)}-${hash({contest_id:input.contest_id,cycle_id:input.cycle_id,projected_outcome:input.projected_outcome,evidenceCutoff}).slice(0,8).toUpperCase()}`;
if(existing.some(x=>x.projection_id===projectionId)) throw new Error(`projection_id already exists: ${projectionId}`);

if(input.probability!=null&&(typeof input.probability!=='number'||input.probability<0||input.probability>1)) throw new Error('probability must be between 0 and 1');
if(input.confidence!=null&&(typeof input.confidence!=='number'||input.confidence<0||input.confidence>100)) throw new Error('confidence must be between 0 and 100');

const state=input.projection_state||'FROZEN';
if(!['OPEN','FROZEN'].includes(state)) throw new Error('new forward projection state must be OPEN or FROZEN');
if(state==='FROZEN'&&typeof input.probability!=='number') throw new Error('FROZEN projection requires an explicit probability for calibration');

const baselines=Array.isArray(input.comparison_baselines)?input.comparison_baselines:[];
if(baselines.filter(x=>x?.primary===true).length>1) throw new Error('comparison_baselines may contain at most one primary baseline');
const baselineIds=new Set();
const comparisonBaselines=baselines.map((b,i)=>{
  const label=`comparison_baselines[${i}]`;
  if(!b||!b.baseline_id) throw new Error(`${label}.baseline_id is required`);
  if(baselineIds.has(b.baseline_id)) throw new Error(`duplicate baseline_id ${b.baseline_id}`);
  baselineIds.add(b.baseline_id);
  if(!['MARKET','CONSENSUS','POLL','MODEL','BOOKMAKER','OTHER'].includes(b.baseline_type)) throw new Error(`${label}.baseline_type is invalid`);
  if(typeof b.probability!=='number'||b.probability<0||b.probability>1) throw new Error(`${label}.probability must be between 0 and 1`);
  const capturedMs=asTime(b.captured_at,`${label}.captured_at`);
  if(capturedMs>cutoffMs) throw new Error(`${label} was captured after evidence_cutoff`);
  if(!Array.isArray(b.source_snapshot_ids)||b.source_snapshot_ids.length===0) throw new Error(`${label}.source_snapshot_ids must not be empty`);
  for(const id of b.source_snapshot_ids){
    const s=snapshots.get(id);
    if(!s) throw new Error(`${label} references unknown source snapshot ${id}`);
    const snapMs=asTime(s.captured_at,`${id}.captured_at`);
    if(snapMs>capturedMs) throw new Error(`${label} source snapshot ${id} postdates baseline capture`);
    if(snapMs>cutoffMs) throw new Error(`${label} source snapshot ${id} postdates evidence cutoff`);
  }
  return {
    baseline_id:b.baseline_id,
    baseline_type:b.baseline_type,
    label:b.label||b.baseline_id,
    probability:b.probability,
    captured_at:b.captured_at,
    source_snapshot_ids:[...new Set(b.source_snapshot_ids)],
    primary:b.primary===true
  };
});

const gradingRule=input.grading_rule||{type:'EXACT_JSON'};
if(gradingRule.type!=='EXACT_JSON') throw new Error('grading_rule.type currently supports EXACT_JSON only');

const preOutcomePayload={
  projection_id:projectionId,
  contest_id:input.contest_id,
  cycle_id:input.cycle_id,
  projected_outcome:input.projected_outcome,
  probability:input.probability??null,
  confidence:input.confidence??null,
  created_at:createdAt,
  evidence_cutoff:evidenceCutoff,
  source_snapshot_ids:[...new Set(input.source_snapshot_ids)],
  intelligence_event_ids:[...new Set(input.intelligence_event_ids||[])],
  analysis_lineage:[...new Set(input.analysis_lineage||[])],
  comparison_baselines:comparisonBaselines,
  grading_rule:gradingRule,
  model_version:input.model_version??'POLITICAL-MAYHEM-FORWARD-002',
  rule_version:input.rule_version??'FORWARD-FIRST-002',
  prior_projection_id:input.prior_projection_id??null,
  revision_reason:input.revision_reason??null,
  projection_state_at_registration:state
};

const projection={
  ...preOutcomePayload,
  projection_state:state,
  verified_outcome_id:null,
  grade:null,
  graded_at:null,
  failure_audit_state:null,
  post_outcome_audit_ref:null,
  integrity:{
    frozen_at:state==='FROZEN'?createdAt:null,
    hindsight_changes_prohibited:true,
    retroactive_signal_backfill_prohibited:true,
    raw_source_change_lineage_prohibited:true,
    pre_outcome_payload_hash:hash(preOutcomePayload),
    registration_hash:hash({projectionId,input,createdAt,evidenceCutoff})
  }
};

ledger.projections ||= [];
ledger.projections.push(projection);
ledger.updated_at=createdAt;
ledger.rules ||= {};
ledger.rules.explicit_probability_required_for_frozen_tip=true;
ledger.rules.comparison_baseline_must_be_pre_freeze=true;
ledger.rules.raw_source_change_requires_signal_promotion_before_projection_use=true;
ledger.rules.grading_rule_precommitted=true;
contest.current_projection_id=projectionId;
contest.updated_at=createdAt;
contestLedger.updated_at=createdAt;
write(ledgerPath,ledger);
write(contestLedgerPath,contestLedger);
console.log(`FORWARD_PROJECTION_REGISTERED ${projectionId} state=${state} contest=${input.contest_id} probability=${projection.probability??'NONE'} baselines=${comparisonBaselines.length} sources=${projection.source_snapshot_ids.length} events=${projection.intelligence_event_ids.length}`);
