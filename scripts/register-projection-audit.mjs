import fs from 'node:fs';
import crypto from 'node:crypto';

const inputPath=process.argv[2];
if(!inputPath) throw new Error('usage: node scripts/register-projection-audit.mjs <audit-input.json>');

const PROJECTIONS='data/runtime/projections.json';
const AUDITS='data/runtime/projection-audits.json';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const compact=d=>d.toISOString().replace(/[-:.TZ]/g,'').slice(0,14);

const input=read(inputPath);
const projections=read(PROJECTIONS);
const audits=read(AUDITS);
const p=(projections.projections||[]).find(x=>x.projection_id===input.projection_id);
if(!p) throw new Error(`unknown projection_id ${input.projection_id}`);
if(p.projection_state!=='GRADED') throw new Error('projection must be GRADED before audit registration');
if(!p.verified_outcome_id) throw new Error('graded projection lacks verified_outcome_id');
if((audits.audits||[]).some(a=>a.projection_id===p.projection_id)) throw new Error('projection already has an audit');
if(!Array.isArray(input.failure_classes)||input.failure_classes.length===0) throw new Error('failure_classes is required');
const allowed=['NONE','MISSING_EVIDENCE','LATE_EVIDENCE','SOURCE_FAILURE','CONTRADICTION_UNRESOLVED','SIGNAL_MISCLASSIFIED','SIGNAL_OVERWEIGHTED','SIGNAL_UNDERWEIGHTED','ACTOR_MODEL_FAILURE','PARTY_MODEL_FAILURE','STRUCTURAL_MODEL_FAILURE','POLLING_ERROR','PROJECTION_RULE_FAILURE','CALIBRATION_FAILURE','ABSTENTION_FAILURE','OTHER'];
for(const c of input.failure_classes) if(!allowed.includes(c)) throw new Error(`invalid failure class ${c}`);
if(p.grade==='INCORRECT'&&input.failure_classes.includes('NONE')) throw new Error('incorrect projection cannot use failure class NONE');

const sourceReviewed=[...new Set(input.source_snapshot_ids_reviewed||p.source_snapshot_ids||[])];
const eventReviewed=[...new Set(input.intelligence_event_ids_reviewed||p.intelligence_event_ids||[])];
const allowedSources=new Set(p.source_snapshot_ids||[]);
const allowedEvents=new Set(p.intelligence_event_ids||[]);
for(const id of sourceReviewed) if(!allowedSources.has(id)) throw new Error(`audit source ${id} was not in the frozen projection evidence set`);
for(const id of eventReviewed) if(!allowedEvents.has(id)) throw new Error(`audit event ${id} was not in the frozen projection intelligence set`);

const now=new Date();
const gradedAt=now.toISOString();
const auditId=input.audit_id||`POL-AUDIT-${compact(now)}-${hash({projection_id:p.projection_id,classes:input.failure_classes,findings:input.failure_findings||[]}).slice(0,8).toUpperCase()}`;
if((audits.audits||[]).some(a=>a.audit_id===auditId)) throw new Error(`audit_id already exists: ${auditId}`);
const audit={
  audit_id:auditId,
  projection_id:p.projection_id,
  verified_outcome_id:p.verified_outcome_id,
  graded_at:gradedAt,
  grade:p.grade,
  pre_outcome_evidence_only:true,
  failure_classes:[...new Set(input.failure_classes)],
  failure_findings:[...(input.failure_findings||[])],
  source_snapshot_ids_reviewed:sourceReviewed,
  intelligence_event_ids_reviewed:eventReviewed,
  open_conflict_ids_at_freeze:[...(input.open_conflict_ids_at_freeze||[])],
  counterfactual_changes_prohibited:true,
  lessons_for_future_rule_versions:[...(input.lessons_for_future_rule_versions||[])],
  post_outcome_observations_separate:[...(input.post_outcome_observations_separate||[])],
  integrity:{
    frozen_projection_unchanged:true,
    no_hindsight_rewrite:true,
    audit_append_only:true,
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
console.log(`PROJECTION_AUDIT_REGISTERED ${auditId} projection=${p.projection_id} grade=${p.grade} frozenSources=${sourceReviewed.length} frozenEvents=${eventReviewed.length}`);
