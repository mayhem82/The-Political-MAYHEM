import fs from 'node:fs';
import crypto from 'node:crypto';

const inputPath=process.argv[2];
if(!inputPath) throw new Error('usage: node scripts/review-forward-source-change.mjs <review-input.json>');

const EVENTS='data/runtime/intelligence-events.json';
const REVIEWS='data/runtime/signal-reviews.json';
const SNAPSHOTS='data/runtime/source-snapshots.json';
const CONTESTS='data/runtime/political-contests.json';
const MANIFEST='data/runtime/forward-ingestion-manifest.json';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const compact=d=>d.toISOString().replace(/[-:.TZ]/g,'').slice(0,14);

const input=read(inputPath);
const events=read(EVENTS);
const reviews=read(REVIEWS);
const snapshots=read(SNAPSHOTS);
const contests=read(CONTESTS);
const manifest=read(MANIFEST);
const now=new Date();
const reviewedAt=now.toISOString();

if(!input.source_change_event_id) throw new Error('source_change_event_id is required');
if(!['PROMOTED_TO_SIGNAL','EXCLUDED_AS_NON_SIGNAL'].includes(input.decision)) throw new Error('decision must be PROMOTED_TO_SIGNAL or EXCLUDED_AS_NON_SIGNAL');
if(!input.review_basis||!String(input.review_basis).trim()) throw new Error('review_basis is required');
if(!['HUMAN','ASSISTED','DETERMINISTIC_RULE'].includes(input.reviewer_mode)) throw new Error('reviewer_mode is required');

const sourceChange=(events.events||[]).find(e=>e.event_id===input.source_change_event_id);
if(!sourceChange) throw new Error(`unknown source-change event ${input.source_change_event_id}`);
if(sourceChange.event_type!=='SOURCE_CHANGED') throw new Error(`${input.source_change_event_id} is not a SOURCE_CHANGED event`);
if(!(snapshots.snapshots||[]).some(s=>s.snapshot_id===sourceChange.source_snapshot_id)) throw new Error('source-change event references missing snapshot');
if((reviews.reviews||[]).some(r=>r.source_change_event_id===input.source_change_event_id)) throw new Error('source-change event already has a review record');

const reviewId=input.review_id||`SIGREV-${compact(now)}-${hash({id:input.source_change_event_id,decision:input.decision,basis:input.review_basis}).slice(0,8).toUpperCase()}`;
if((reviews.reviews||[]).some(r=>r.review_id===reviewId)) throw new Error(`review_id already exists: ${reviewId}`);

let signalEventId=null;
if(input.decision==='PROMOTED_TO_SIGNAL'){
  if(!input.claim||!String(input.claim).trim()) throw new Error('claim is required for PROMOTED_TO_SIGNAL');
  if(!['POSSIBLE_SIGNAL','PROBABLE_SIGNAL','CORROBORATED_SIGNAL','CONFIRMED_FACT','CONFLICTING'].includes(input.signal_state)) throw new Error('valid signal_state is required for promotion');
  if(!['MATERIAL','CONTEST_RELEVANT','UNKNOWN'].includes(input.materiality_state)) throw new Error('materiality_state must be MATERIAL, CONTEST_RELEVANT or UNKNOWN for promotion');
  if(input.contest_id){
    const contest=(contests.contests||[]).find(c=>c.contest_id===input.contest_id);
    if(!contest) throw new Error(`unknown contest_id ${input.contest_id}`);
    if(input.cycle_id&&contest.cycle_id!==input.cycle_id) throw new Error('cycle_id does not match contest');
  }
  signalEventId=input.signal_event_id||`SIG-${compact(now)}-${hash({source_change_event_id:input.source_change_event_id,claim:input.claim}).slice(0,8).toUpperCase()}`;
  if((events.events||[]).some(e=>e.event_id===signalEventId)) throw new Error(`signal_event_id already exists: ${signalEventId}`);
  events.events.push({
    event_id:signalEventId,
    parent_event_id:sourceChange.event_id,
    contest_id:input.contest_id??null,
    cycle_id:input.cycle_id??null,
    jurisdiction_id:input.jurisdiction_id??sourceChange.jurisdiction_id??null,
    party_id:input.party_id??sourceChange.party_id??null,
    actor_id:input.actor_id??null,
    source_snapshot_id:sourceChange.source_snapshot_id,
    captured_at:reviewedAt,
    event_time:input.event_time??null,
    event_date:input.event_date??null,
    checkpoint:input.checkpoint??'FORWARD_SOURCE_CHANGE_REVIEW',
    event_type:'SIGNAL_CREATED',
    evidence_state:input.evidence_state??'SIGNAL',
    signal_state:input.signal_state,
    semantic_review_state:'PROMOTED',
    materiality_state:input.materiality_state,
    source_class:sourceChange.source_class,
    source_id:sourceChange.source_id??null,
    claim:input.claim,
    observed_behaviour:input.observed_behaviour??sourceChange.observed_behaviour??null,
    direct_actor_statement:input.direct_actor_statement??null,
    inference:input.inference??null,
    inference_class:input.inference_class??'NONE',
    conflict_ids:[...new Set(input.conflict_ids||[])],
    projection_effect:'NO_EFFECT',
    information_advantage:'NONE',
    frozen:false,
    review_id:reviewId
  });
}

const review={
  review_id:reviewId,
  source_change_event_id:sourceChange.event_id,
  decision:input.decision,
  signal_event_id:signalEventId,
  contest_id:input.contest_id??null,
  cycle_id:input.cycle_id??null,
  party_id:input.party_id??sourceChange.party_id??null,
  actor_id:input.actor_id??null,
  signal_state:input.decision==='PROMOTED_TO_SIGNAL'?input.signal_state:'EXCLUDED',
  materiality_state:input.decision==='PROMOTED_TO_SIGNAL'?input.materiality_state:(input.materiality_state??'IMMATERIAL'),
  claim:input.claim??null,
  review_basis:input.review_basis,
  reviewed_at:reviewedAt,
  reviewer_mode:input.reviewer_mode,
  integrity:{source_change_unchanged:true,review_append_only:true,no_projection_effect_by_default:true}
};
reviews.reviews ||= [];
reviews.reviews.push(review);
reviews.updated_at=reviewedAt;
events.captured_at=reviewedAt;
manifest.updated_at=reviewedAt;
manifest.live_evidence_ingestion ||= {};
manifest.live_evidence_ingestion.signal_reviews_ingested=reviews.reviews.length;
manifest.live_evidence_ingestion.signals_ingested=(events.events||[]).filter(e=>e.event_type==='SIGNAL_CREATED').length;
manifest.status='LIVE_INGESTION_ACTIVE_RAW_SOURCE_CHANGE_CAPTURE_AND_SIGNAL_PROMOTION';
write(REVIEWS,reviews);
write(EVENTS,events);
write(MANIFEST,manifest);
console.log(`FORWARD_SOURCE_CHANGE_REVIEWED review=${reviewId} decision=${input.decision} signal=${signalEventId??'NONE'}`);
