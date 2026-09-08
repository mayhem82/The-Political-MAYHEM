import fs from 'node:fs';
import path from 'node:path';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const fail=[];
const assert=(ok,msg)=>{if(!ok)fail.push(msg)};
const unique=xs=>new Set(xs).size===xs.length;
const manifest=read('data/snapshot-manifest.json');
for(const key of [
  'forward_signal_capture_active',
  'forward_signal_first_capture_is_baseline_not_signal',
  'source_change_not_equated_to_substantive_fact',
  'forward_signal_semantic_promotion_requires_evidence',
  'forward_signal_source_failures_remain_explicit',
  'forward_signal_seed_identity_collisions_are_rejected',
  'raw_source_change_is_not_projection_evidence',
  'signal_review_ledger_append_only'
]) assert(manifest.integrity?.[key]===true,`forward signal integrity invariant missing: ${key}`);

const registryPath=manifest.canonical?.forward_signal_source_registry?.path;
const statePath=manifest.runtime?.forward_signal_capture_state;
const reviewPath=manifest.runtime?.signal_review_ledger;
assert(Boolean(registryPath&&fs.existsSync(registryPath)),'forward signal source registry missing');
assert(Boolean(statePath&&fs.existsSync(statePath)),'forward signal capture state missing');
assert(Boolean(reviewPath&&fs.existsSync(reviewPath)),'signal review ledger missing');
if(!registryPath||!statePath||!reviewPath||!fs.existsSync(registryPath)||!fs.existsSync(statePath)||!fs.existsSync(reviewPath)){
  console.error('POLITICAL_MAYHEM_FORWARD_SIGNAL_INTEGRITY_FAILED');
  for(const m of fail)console.error('- '+m);
  process.exit(1);
}

const registry=read(registryPath);
const state=read(statePath);
const reviews=read(reviewPath);
const snapshots=read(manifest.runtime.source_snapshots);
const events=read(manifest.runtime.intelligence_events);
const watches=registry.sources||[];
const active=watches.filter(x=>x.active);
assert(/^ACTIVE/.test(registry.status||''),'forward signal source registry is not active');
assert(registry.capture_cadence==='HOURLY','forward signal source registry cadence is not hourly');
assert(registry.rules?.forward_only===true,'forward signal registry is not forward-only');
assert(registry.rules?.first_capture_establishes_baseline===true,'first-capture baseline rule missing');
assert(registry.rules?.raw_source_change_is_not_a_political_signal===true,'raw-source-change semantic boundary missing');
assert(registry.rules?.raw_source_change_is_preserved_as_source_changed_event===true,'raw source change preservation rule missing');
assert(registry.rules?.semantic_promotion_requires_explicit_review_record===true,'explicit signal-review requirement missing');
assert(registry.rules?.semantic_promotion_requires_source_specific_extraction_or_review===true,'semantic promotion evidence rule missing');
assert(registry.rules?.raw_source_change_must_not_enter_projection_lineage===true,'raw source change projection prohibition missing');
assert(registry.rules?.same_hash_must_not_create_duplicate_change===true,'same-hash duplicate change prohibition missing');
assert(registry.rules?.legacy_possible_signal_records_are_retained_and_not_rewritten===true,'legacy signal retention rule missing');
assert(unique(watches.map(x=>x.watch_id)),'forward watcher IDs are not unique');
assert(unique(watches.map(x=>x.source_id)),'forward watcher source IDs are not unique');
for(const w of active) assert(w.watch_id&&w.source_id&&w.url&&w.source_class&&w.jurisdiction_id,`incomplete active forward watcher: ${w.watch_id||'UNKNOWN'}`);
assert(state.status==='ACTIVE','forward signal capture state is not ACTIVE');

const failures=new Map((state.last_run?.failures||[]).map(x=>[x.watch_id,x.error]));
for(const w of active) assert(Boolean(state.sources?.[w.watch_id])||failures.has(w.watch_id),`active watcher has neither captured baseline nor explicit failure: ${w.watch_id}`);

const snapshotRows=snapshots.snapshots||[];
const eventRows=events.events||[];
const reviewRows=reviews.reviews||[];
assert(snapshots.mode==='FORWARD_ONLY','source snapshot ledger is not forward-only');
assert(events.mode==='FORWARD_ONLY','intelligence event ledger is not forward-only');
assert(reviews.rules?.append_only===true,'signal review ledger is not append-only');
assert(reviews.rules?.raw_source_change_is_immutable===true,'signal review ledger does not preserve raw source changes');
assert(reviews.rules?.promotion_requires_explicit_review===true,'signal review ledger does not require explicit promotion review');
assert(unique(snapshotRows.map(x=>x.snapshot_id)),'source snapshot IDs are not unique');
assert(unique(eventRows.map(x=>x.event_id)),'intelligence event IDs are not unique');
assert(unique(reviewRows.map(x=>x.review_id)),'signal review IDs are not unique');
assert(unique(reviewRows.map(x=>x.source_change_event_id)),'a raw source change has multiple review records');
const snapshotIds=new Set(snapshotRows.map(x=>x.snapshot_id));
const eventById=new Map(eventRows.map(x=>[x.event_id,x]));
for(const e of eventRows) assert(snapshotIds.has(e.source_snapshot_id),`intelligence event references missing snapshot: ${e.event_id} -> ${e.source_snapshot_id}`);

const autoFirstBaselines=snapshotRows.filter(s=>s.source_registry_snapshot===registry.registry_id&&!s.previous_snapshot_id);
for(const s of autoFirstBaselines){
  assert(!eventRows.some(e=>['SOURCE_CHANGED','SIGNAL_CREATED'].includes(e.event_type)&&e.source_snapshot_id===s.snapshot_id),`automated first baseline incorrectly emitted a change/signal: ${s.snapshot_id}`);
}

for(const e of eventRows.filter(x=>String(x.event_id||'').startsWith('CHG-WATCH-'))){
  assert(e.event_type==='SOURCE_CHANGED',`${e.event_id} raw watcher event is not SOURCE_CHANGED`);
  assert(e.evidence_state==='VERIFIED',`${e.event_id} raw source change is not marked as verified observation`);
  assert(e.signal_state==='OBSERVED',`${e.event_id} raw source change is incorrectly classed as a political signal`);
  assert(e.semantic_review_state==='PENDING',`${e.event_id} raw source change is not pending semantic review`);
  assert(e.materiality_state==='UNASSESSED',`${e.event_id} raw source change has premature materiality classification`);
  assert(e.inference===null&&e.inference_class==='NONE',`${e.event_id} raw source change contains inference`);
  assert(e.projection_effect==='NO_EFFECT',`${e.event_id} raw source change alters a projection`);
  assert(Boolean(e.before?.snapshot_id)&&Boolean(e.after?.snapshot_id),`${e.event_id} raw source change lacks snapshot lineage`);
  assert(Boolean(e.representation_delta?.delta_hash),`${e.event_id} raw source change lacks reproducible delta hash`);
}

// Legacy automated watcher records created before raw-change/signal separation remain immutable.
for(const e of eventRows.filter(x=>String(x.event_id||'').startsWith('SIG-WATCH-'))){
  assert(e.event_type==='SIGNAL_CREATED',`${e.event_id} legacy automated event type changed`);
  assert(e.evidence_state==='SIGNAL',`${e.event_id} legacy source change evidence state changed`);
  assert(e.signal_state==='POSSIBLE_SIGNAL',`${e.event_id} legacy source change signal state changed`);
  assert(e.inference===null&&e.inference_class==='NONE',`${e.event_id} legacy source change contains inference`);
  assert(e.projection_effect==='NO_EFFECT',`${e.event_id} legacy source change alters projection`);
}

for(const r of reviewRows){
  const sourceChange=eventById.get(r.source_change_event_id);
  assert(Boolean(sourceChange),`${r.review_id} references missing source-change event`);
  if(sourceChange) assert(sourceChange.event_type==='SOURCE_CHANGED',`${r.review_id} does not reference a SOURCE_CHANGED event`);
  assert(['PROMOTED_TO_SIGNAL','EXCLUDED_AS_NON_SIGNAL'].includes(r.decision),`${r.review_id} has invalid decision`);
  assert(r.integrity?.source_change_unchanged===true,`${r.review_id} does not preserve source change`);
  assert(r.integrity?.review_append_only===true,`${r.review_id} is not append-only`);
  assert(r.integrity?.no_projection_effect_by_default===true,`${r.review_id} permits implicit projection effect`);
  if(r.decision==='PROMOTED_TO_SIGNAL'){
    const signal=eventById.get(r.signal_event_id);
    assert(Boolean(signal),`${r.review_id} promoted signal event is missing`);
    if(signal){
      assert(signal.event_type==='SIGNAL_CREATED',`${r.review_id} promoted event is not SIGNAL_CREATED`);
      assert(signal.parent_event_id===r.source_change_event_id,`${r.review_id} signal parent does not match raw source change`);
      assert(signal.review_id===r.review_id,`${r.review_id} signal does not retain review lineage`);
      assert(signal.projection_effect==='NO_EFFECT',`${r.review_id} promotion directly alters a projection`);
    }
  }else{
    assert(r.signal_event_id===null,`${r.review_id} excluded source change incorrectly has a signal event`);
  }
}

for(const e of eventRows){
  if(!e.contest_id) assert(e.projection_effect==='NO_EFFECT'||e.projection_effect==null,`${e.event_id} has projection effect without a registered contest`);
  if(e.inference_class==='NONE') assert(e.inference===null||e.inference===undefined,`${e.event_id} carries inference while classed NONE`);
}

const seedDir='data/forward-signal-seeds';
const seedSnapshots=[];const seedEvents=[];
if(fs.existsSync(seedDir)) for(const file of fs.readdirSync(seedDir).filter(f=>f.endsWith('.json')).sort()){
  const seed=read(path.join(seedDir,file));
  assert(seed.mode==='FORWARD_ONLY',`${file} signal seed is not forward-only`);
  for(const s of seed.snapshots||[])seedSnapshots.push(s.snapshot_id);
  for(const e of seed.events||[])seedEvents.push(e.event_id);
}
assert(unique(seedSnapshots),'duplicate source snapshot identity exists across forward signal seeds');
assert(unique(seedEvents),'duplicate intelligence event identity exists across forward signal seeds');
for(const id of seedSnapshots)assert(snapshotIds.has(id),`forward signal seed snapshot not ingested: ${id}`);
const eventIds=new Set(eventRows.map(x=>x.event_id));
for(const id of seedEvents)assert(eventIds.has(id),`forward signal seed event not ingested: ${id}`);

if(fail.length){
  console.error('POLITICAL_MAYHEM_FORWARD_SIGNAL_INTEGRITY_FAILED');
  for(const m of fail)console.error('- '+m);
  process.exit(1);
}
console.log('POLITICAL_MAYHEM_FORWARD_SIGNAL_INTEGRITY_PASS',`watchers=${watches.length}`,`active=${active.length}`,`baselines=${Object.keys(state.sources||{}).length}`,`explicitFailures=${failures.size}`,`snapshots=${snapshotRows.length}`,`events=${eventRows.length}`,`rawChanges=${eventRows.filter(x=>x.event_type==='SOURCE_CHANGED').length}`,`semanticSignals=${eventRows.filter(x=>x.event_type==='SIGNAL_CREATED').length}`,`reviews=${reviewRows.length}`);
