import fs from 'node:fs';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const fail=[];
const assert=(ok,msg)=>{if(!ok)fail.push(msg)};
const unique=xs=>new Set(xs).size===xs.length;

const manifest=read('data/snapshot-manifest.json');
const registry=read('data/forward-signal-source-registry.json');
const policy=read('data/forward-signal-review-policy.json');
const transition=read('data/forward-capture-transition-register.json');
const state=read('data/runtime/forward-signal-capture-state.json');
const snapshots=read('data/runtime/source-snapshots.json');
const events=read('data/runtime/intelligence-events.json');
const reviews=read('data/runtime/signal-reviews.json');

const integrityKeys=[
 'forward_first','hindsight_changes_prohibited','retroactive_signal_backfill_prohibited',
 'forward_signal_capture_active','forward_signal_first_capture_is_baseline_not_signal',
 'source_change_not_equated_to_substantive_fact','forward_signal_semantic_promotion_requires_evidence',
 'raw_source_change_is_not_projection_evidence','signal_review_ledger_append_only',
 'all_nine_fields_have_multi_source_forward_capture','structured_publication_capture_is_order_independent',
 'capture_mode_migration_cannot_create_false_signal','deterministic_signal_review_is_limited_to_structured_publication_additions',
 'deterministic_signal_review_does_not_verify_underlying_publication_claims','removal_only_publication_change_is_not_auto_promoted',
 'unstructured_source_change_requires_review'
];
for(const key of integrityKeys) assert(manifest.integrity?.[key]===true,`manifest invariant missing: ${key}`);

const active=(registry.sources||[]).filter(x=>x.active);
const fields=['AUS-FED','AUS-NSW','AUS-VIC','AUS-QLD','AUS-WA','AUS-SA','AUS-TAS','AUS-ACT','AUS-NT'];
assert(registry.capture_cadence==='HOURLY','capture cadence is not HOURLY');
assert(active.length>=27,`active watcher count ${active.length} below nine-field minimum`);
assert(unique(active.map(x=>x.watch_id)),'watch IDs are not unique');
assert(unique(active.map(x=>x.source_id)),'source IDs are not unique');
for(const field of fields){
 const rows=active.filter(x=>x.jurisdiction_id===field);
 assert(rows.length>=3,`${field} has ${rows.length} watchers; expected >=3`);
 assert(new Set(rows.map(x=>x.source_class)).size>=2,`${field} lacks source-class diversity`);
}
for(const w of active){
 assert(w.watch_id&&w.source_id&&w.url&&w.source_class&&w.jurisdiction_id,`incomplete watcher ${w.watch_id||'UNKNOWN'}`);
 assert(['NORMALISED_PAGE_HASH','PUBLICATION_FEED_HASH'].includes(w.capture_mode),`${w.watch_id} invalid capture mode`);
 assert(['REVIEW_UNSTRUCTURED_CHANGE','AUTO_PROMOTE_PUBLICATION_ADDITIONS'].includes(w.review_policy),`${w.watch_id} invalid review policy`);
 if(w.review_policy==='AUTO_PROMOTE_PUBLICATION_ADDITIONS') assert(w.capture_mode==='PUBLICATION_FEED_HASH',`${w.watch_id} auto-review without structured capture`);
}

assert(policy.status==='ACTIVE','review policy inactive');
assert(policy.rules?.raw_source_change_never_auto_becomes_substantive_claim===true,'raw-change semantic firewall missing');
assert(policy.rules?.automatic_promotion_requires_structured_added_records===true,'structured-addition promotion rule missing');
assert(policy.rules?.automatic_promotion_does_not_validate_underlying_claim_content===true,'publication-claim firewall missing');
assert(policy.rules?.removal_only_change_is_excluded_as_non_signal===true,'removal-only exclusion rule missing');
assert(policy.rules?.unstructured_page_change_requires_review===true,'unstructured-review rule missing');
assert(policy.rules?.projection_effect_is_always_no_effect_at_signal_promotion===true,'promotion projection firewall missing');

assert(transition.status==='CLOSED_TRANSITION_WINDOW','capture transition window is not closed');
assert(transition.rules?.listed_snapshots_remain_immutable===true,'transition snapshot immutability missing');
assert(transition.rules?.listed_snapshots_are_not_signal_evidence===true,'transition signal exclusion missing');
assert(transition.rules?.listed_snapshots_are_not_projection_evidence===true,'transition projection exclusion missing');
assert(transition.rules?.next_successful_structured_capture_reestablishes_baseline_without_signal===true,'transition rebaseline rule missing');
const transitionIds=new Set(transition.snapshot_ids||[]);
assert(unique([...transitionIds]),'duplicate transition snapshot IDs');

const snapshotRows=snapshots.snapshots||[];
const eventRows=events.events||[];
const reviewRows=reviews.reviews||[];
const snapshotById=new Map(snapshotRows.map(x=>[x.snapshot_id,x]));
const eventById=new Map(eventRows.map(x=>[x.event_id,x]));
assert(unique(snapshotRows.map(x=>x.snapshot_id)),'snapshot IDs are not unique');
assert(unique(eventRows.map(x=>x.event_id)),'event IDs are not unique');
assert(unique(reviewRows.map(x=>x.review_id)),'review IDs are not unique');
assert(unique(reviewRows.map(x=>x.source_change_event_id)),'source change reviewed more than once');

for(const id of transitionIds){
 const s=snapshotById.get(id);
 assert(Boolean(s),`transition register references missing snapshot ${id}`);
 if(!s) continue;
 assert(!Object.prototype.hasOwnProperty.call(s,'capture_mode'),`${id} transition snapshot legacy capture metadata was mutated`);
 assert(!eventRows.some(e=>e.source_snapshot_id===id&&['SOURCE_CHANGED','SIGNAL_CREATED'].includes(e.event_type)),`${id} transition snapshot incorrectly entered change/signal lineage`);
 assert(!reviewRows.some(r=>eventById.get(r.source_change_event_id)?.source_snapshot_id===id),`${id} transition snapshot incorrectly entered review lineage`);
}

for(const s of snapshotRows.filter(s=>s.source_registry_snapshot===registry.registry_id)){
 if(transitionIds.has(s.snapshot_id)) continue;
 assert(['NORMALISED_PAGE_HASH','PUBLICATION_FEED_HASH'].includes(s.capture_mode),`${s.snapshot_id} invalid current-registry capture mode`);
 if(s.capture_mode==='PUBLICATION_FEED_HASH'){
  assert(Array.isArray(s.structured_records)&&s.structured_records.length>0,`${s.snapshot_id} publication snapshot lacks structured records`);
  assert(s.hash_basis==='COMPLETE_STRUCTURED_PUBLICATION_RECORD_SET',`${s.snapshot_id} structured snapshot has wrong hash basis`);
 }
 if(s.capture_mode==='NORMALISED_PAGE_HASH') assert(Boolean(s.content_hash),`${s.snapshot_id} normalised snapshot lacks content hash`);
}

const failures=new Map((state.last_run?.failures||[]).map(x=>[x.watch_id,x.error]));
const registryUpdatedAt=Date.parse(registry.updated_at||'');
const lastCaptureAt=Date.parse(state.last_run?.captured_at||state.updated_at||'');
const registryNewerThanCapture=Number.isFinite(registryUpdatedAt)&&Number.isFinite(lastCaptureAt)&&registryUpdatedAt>lastCaptureAt;
let pendingFirstCapture=0;
for(const w of active){
 const current=state.sources?.[w.watch_id];
 const pending=Boolean(!current&&!failures.has(w.watch_id)&&registryNewerThanCapture);
 if(pending) pendingFirstCapture++;
 assert(Boolean(current)||failures.has(w.watch_id)||pending,`${w.watch_id} has neither baseline nor explicit latest-run failure`);
 if(!current) continue;
 const s=snapshotById.get(current.snapshot_id);
 assert(Boolean(s),`${w.watch_id} current state references missing snapshot ${current.snapshot_id}`);
 if(w.capture_mode==='PUBLICATION_FEED_HASH'&&s&&!transitionIds.has(s.snapshot_id)){
  assert(Array.isArray(s.structured_records)&&s.structured_records.length>0,`${w.watch_id} latest structured baseline has no records`);
 }
 if(transitionIds.has(current.snapshot_id)){
  assert(['PUBLICATION_FEED_HASH','TRANSITIONAL_PUBLICATION_HASH'].includes(current.capture_mode),`${w.watch_id} transition pointer has invalid state mode`);
 }
}
if(pendingFirstCapture>0) assert(registryNewerThanCapture,'pending first capture is only allowed after a newer source-registry revision');

const rawChanges=eventRows.filter(e=>e.event_type==='SOURCE_CHANGED');
const reviewedByChange=new Map(reviewRows.map(r=>[r.source_change_event_id,r]));
for(const e of rawChanges){
 assert(e.evidence_state==='VERIFIED',`${e.event_id} raw change not VERIFIED observation`);
 assert(e.signal_state==='OBSERVED',`${e.event_id} raw change incorrectly classed as political signal`);
 assert(e.projection_effect==='NO_EFFECT',`${e.event_id} raw change affects projection`);
 assert(e.inference==null&&e.inference_class==='NONE',`${e.event_id} raw change contains inference`);
 assert(Boolean(e.before?.snapshot_id)&&Boolean(e.after?.snapshot_id),`${e.event_id} lacks before/after lineage`);
 assert(Boolean(e.representation_delta?.delta_hash),`${e.event_id} lacks delta hash`);
 assert(!transitionIds.has(e.source_snapshot_id),`${e.event_id} illegally uses transition snapshot as changed evidence`);
 if(e.capture_mode==='PUBLICATION_FEED_HASH'&&e.review_policy==='AUTO_PROMOTE_PUBLICATION_ADDITIONS'){
  assert(e.representation_delta?.delta_type==='STRUCTURED_RECORD_SET',`${e.event_id} auto-reviewable change lacks structured delta`);
  const added=e.representation_delta?.records_added||[];
  const removed=e.representation_delta?.records_removed||[];
  if(added.length||removed.length) assert(reviewedByChange.has(e.event_id),`${e.event_id} structured change lacks deterministic review`);
 }
}

for(const r of reviewRows){
 const parent=eventById.get(r.source_change_event_id);
 assert(Boolean(parent),`${r.review_id} missing parent source change`);
 if(parent) assert(parent.event_type==='SOURCE_CHANGED',`${r.review_id} parent is not SOURCE_CHANGED`);
 assert(['PROMOTED_TO_SIGNAL','EXCLUDED_AS_NON_SIGNAL'].includes(r.decision),`${r.review_id} invalid decision`);
 assert(r.integrity?.source_change_unchanged===true,`${r.review_id} source-change immutability missing`);
 assert(r.integrity?.review_append_only===true,`${r.review_id} append-only rule missing`);
 assert(r.integrity?.no_projection_effect_by_default===true,`${r.review_id} projection firewall missing`);
 if(r.reviewer_mode==='DETERMINISTIC_RULE'){
  const added=parent?.representation_delta?.records_added||[];
  const removed=parent?.representation_delta?.records_removed||[];
  assert(parent?.capture_mode==='PUBLICATION_FEED_HASH',`${r.review_id} deterministic review not backed by structured capture`);
  assert(r.policy_id===policy.policy_id,`${r.review_id} wrong review policy lineage`);
  if(r.decision==='PROMOTED_TO_SIGNAL') assert(added.length>0,`${r.review_id} promoted with no added publication record`);
  if(r.decision==='EXCLUDED_AS_NON_SIGNAL') assert(added.length===0&&removed.length>0,`${r.review_id} exclusion is not removal-only`);
 }
 if(r.decision==='PROMOTED_TO_SIGNAL'){
  const signal=eventById.get(r.signal_event_id);
  assert(Boolean(signal),`${r.review_id} promoted signal missing`);
  if(signal){
   assert(signal.event_type==='SIGNAL_CREATED',`${r.review_id} child event is not SIGNAL_CREATED`);
   assert(signal.parent_event_id===r.source_change_event_id,`${r.review_id} child lost parent lineage`);
   assert(signal.review_id===r.review_id,`${r.review_id} child lost review lineage`);
   assert(signal.projection_effect==='NO_EFFECT',`${r.review_id} promotion directly altered projection`);
   if(r.reviewer_mode==='DETERMINISTIC_RULE'){
    assert(signal.integrity?.underlying_publication_claims_not_promoted_to_verified_fact===true,`${r.review_id} child lacks underlying-claim firewall`);
    assert(signal.materiality_state==='UNKNOWN',`${r.review_id} deterministic promotion inferred materiality`);
   }
  }
 }else assert(r.signal_event_id===null,`${r.review_id} excluded review has signal event`);
}

for(const e of eventRows){
 assert(snapshotById.has(e.source_snapshot_id),`${e.event_id} references missing source snapshot`);
 if(!e.contest_id) assert(e.projection_effect==='NO_EFFECT'||e.projection_effect==null,`${e.event_id} affects projection without contest`);
}

if(fail.length){
 console.error('POLITICAL_MAYHEM_FORWARD_SIGNAL_INTEGRITY_V2_FAILED');
 for(const m of fail) console.error('- '+m);
 process.exit(1);
}
console.log('POLITICAL_MAYHEM_FORWARD_SIGNAL_INTEGRITY_V2_PASS',`active=${active.length}`,`fields=${fields.length}`,`snapshots=${snapshotRows.length}`,`transition=${transitionIds.size}`,`rawChanges=${rawChanges.length}`,`reviews=${reviewRows.length}`,`promoted=${reviewRows.filter(r=>r.decision==='PROMOTED_TO_SIGNAL').length}`,`latestFailures=${failures.size}`,`pendingFirstCapture=${pendingFirstCapture}`);
