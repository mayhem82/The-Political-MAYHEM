import fs from 'node:fs';
import crypto from 'node:crypto';

const inputPath=process.argv[2];
if(!inputPath) throw new Error('usage: node scripts/register-projection-audit.mjs <audit-input.json>');

const PROJECTIONS='data/runtime/projections.json';
const AUDITS='data/runtime/projection-audits.json';
const SNAPSHOTS='data/runtime/source-snapshots.json';
const EVENTS='data/runtime/intelligence-events.json';
const OUTCOMES='data/runtime/verified-outcomes.json';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const compact=d=>d.toISOString().replace(/[-:.TZ]/g,'').slice(0,14);
const asTime=(v,label)=>{const t=Date.parse(v);if(!Number.isFinite(t)) throw new Error(`${label} must be a valid date-time`);return t;};
const unique=v=>[...new Set(v||[])];

const input=read(inputPath);
const projections=read(PROJECTIONS);
const audits=read(AUDITS);
const snapshots=read(SNAPSHOTS);
const events=read(EVENTS);
const outcomes=read(OUTCOMES);
const p=(projections.projections||[]).find(x=>x.projection_id===input.projection_id);
if(!p) throw new Error(`unknown projection_id ${input.projection_id}`);
if(p.projection_state!=='GRADED') throw new Error('projection must be GRADED before audit registration');
if(!p.verified_outcome_id) throw new Error('graded projection lacks verified_outcome_id');
if((audits.audits||[]).some(a=>a.projection_id===p.projection_id)) throw new Error('projection already has an audit');
if(!Array.isArray(input.failure_classes)||input.failure_classes.length===0) throw new Error('failure_classes is required');
const allowed=['NONE','MISSING_EVIDENCE','LATE_EVIDENCE','SOURCE_FAILURE','CONTRADICTION_UNRESOLVED','SIGNAL_MISCLASSIFIED','SIGNAL_OVERWEIGHTED','SIGNAL_UNDERWEIGHTED','ACTOR_MODEL_FAILURE','PARTY_MODEL_FAILURE','STRUCTURAL_MODEL_FAILURE','POLLING_ERROR','PROJECTION_RULE_FAILURE','CALIBRATION_FAILURE','ABSTENTION_FAILURE','OTHER'];
for(const c of input.failure_classes) if(!allowed.includes(c)) throw new Error(`invalid failure class ${c}`);
if(p.grade==='INCORRECT'&&input.failure_classes.includes('NONE')) throw new Error('incorrect projection cannot use failure class NONE');

const outcome=(outcomes.outcomes||[]).find(x=>x.outcome_id===p.verified_outcome_id);
if(!outcome) throw new Error(`verified outcome ${p.verified_outcome_id} does not exist`);
if(outcome.verification_state!=='VERIFIED') throw new Error(`verified outcome ${p.verified_outcome_id} is not VERIFIED`);
const freezeTime=asTime(p.integrity?.frozen_at||p.evidence_cutoff,`${p.projection_id}.freeze time`);
const outcomeTime=asTime(outcome.effective_at||outcome.recorded_at,`${outcome.outcome_id}.outcome time`);
if(outcomeTime<freezeTime) throw new Error('verified outcome time cannot predate projection freeze');

const snapshotMap=new Map((snapshots.snapshots||[]).map(x=>[x.snapshot_id,x]));
const eventMap=new Map((events.events||[]).map(x=>[x.event_id,x]));
const sourceReviewed=unique([...(p.source_snapshot_ids||[]),...(input.source_snapshot_ids_reviewed||[])]);
const eventReviewed=unique([...(p.intelligence_event_ids||[]),...(input.intelligence_event_ids_reviewed||[])]);

const timing={
  pre_freeze_source_snapshot_ids:[],
  pre_freeze_intelligence_event_ids:[],
  post_freeze_source_snapshot_ids:[],
  post_freeze_intelligence_event_ids:[],
  post_outcome_source_snapshot_ids:[],
  post_outcome_intelligence_event_ids:[]
};
const classify=(captured,pre,postFreeze,postOutcome,id)=>{
  if(captured<=freezeTime) pre.push(id);
  else if(captured<=outcomeTime) postFreeze.push(id);
  else postOutcome.push(id);
};
for(const id of sourceReviewed){
  const s=snapshotMap.get(id);
  if(!s) throw new Error(`audit references unknown source snapshot ${id}`);
  classify(asTime(s.captured_at,`${id}.captured_at`),timing.pre_freeze_source_snapshot_ids,timing.post_freeze_source_snapshot_ids,timing.post_outcome_source_snapshot_ids,id);
}
for(const id of eventReviewed){
  const e=eventMap.get(id);
  if(!e) throw new Error(`audit references unknown intelligence event ${id}`);
  classify(asTime(e.captured_at,`${id}.captured_at`),timing.pre_freeze_intelligence_event_ids,timing.post_freeze_intelligence_event_ids,timing.post_outcome_intelligence_event_ids,id);
}
for(const id of(p.source_snapshot_ids||[])) if(!timing.pre_freeze_source_snapshot_ids.includes(id)) throw new Error(`frozen projection source ${id} is not pre-freeze`);
for(const id of(p.intelligence_event_ids||[])) if(!timing.pre_freeze_intelligence_event_ids.includes(id)) throw new Error(`frozen projection event ${id} is not pre-freeze`);

const now=new Date();
const gradedAt=now.toISOString();
const auditId=input.audit_id||`POL-AUDIT-${compact(now)}-${hash({projection_id:p.projection_id,classes:input.failure_classes,findings:input.failure_findings||[],sources:sourceReviewed,events:eventReviewed}).slice(0,8).toUpperCase()}`;
if((audits.audits||[]).some(a=>a.audit_id===auditId)) throw new Error(`audit_id already exists: ${auditId}`);
const audit={
  audit_id:auditId,
  projection_id:p.projection_id,
  verified_outcome_id:p.verified_outcome_id,
  graded_at:gradedAt,
  grade:p.grade,
  evidence_timing:timing,
  failure_classes:unique(input.failure_classes),
  failure_findings:[...(input.failure_findings||[])],
  source_snapshot_ids_reviewed:sourceReviewed,
  intelligence_event_ids_reviewed:eventReviewed,
  open_conflict_ids_at_freeze:[...(input.open_conflict_ids_at_freeze||[])],
  counterfactual_changes_prohibited:true,
  lessons_for_future_rule_versions:[...(input.lessons_for_future_rule_versions||[])],
  integrity:{
    frozen_projection_unchanged:true,
    no_hindsight_rewrite:true,
    audit_append_only:true,
    later_evidence_not_credited_to_frozen_projection:true,
    frozen_pre_outcome_payload_hash:p.integrity?.pre_outcome_payload_hash??null
  }
};
audits.audits ||= [];
audits.audits.push(audit);
audits.updated_at=gradedAt;
p.failure_audit_state='COMPLETE';
p.post_outcome_audit_ref=auditId;
projections.updated_at=gradedAt;
write(AUDITS,audits);
write(PROJECTIONS,projections);
const laterSources=timing.post_freeze_source_snapshot_ids.length+timing.post_outcome_source_snapshot_ids.length;
const laterEvents=timing.post_freeze_intelligence_event_ids.length+timing.post_outcome_intelligence_event_ids.length;
console.log(`PROJECTION_AUDIT_REGISTERED ${auditId} projection=${p.projection_id} grade=${p.grade} preFreezeSources=${timing.pre_freeze_source_snapshot_ids.length} laterSources=${laterSources} preFreezeEvents=${timing.pre_freeze_intelligence_event_ids.length} laterEvents=${laterEvents}`);
