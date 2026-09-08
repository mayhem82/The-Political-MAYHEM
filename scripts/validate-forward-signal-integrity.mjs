import fs from 'node:fs';
import path from 'node:path';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const fail=[];
const assert=(ok,msg)=>{if(!ok)fail.push(msg)};
const unique=xs=>new Set(xs).size===xs.length;
const manifest=read('data/snapshot-manifest.json');
const requiredIntegrity=[
  'forward_signal_capture_active',
  'forward_signal_first_capture_is_baseline_not_signal',
  'source_change_not_equated_to_substantive_fact',
  'forward_signal_semantic_promotion_requires_evidence',
  'forward_signal_source_failures_remain_explicit',
  'forward_signal_seed_identity_collisions_are_rejected',
  'raw_source_change_is_not_projection_evidence',
  'signal_review_ledger_append_only',
  'all_nine_fields_have_multi_source_forward_capture',
  'structured_publication_capture_is_order_independent',
  'capture_mode_migration_cannot_create_false_signal',
  'deterministic_signal_review_is_limited_to_structured_publication_additions',
  'deterministic_signal_review_does_not_verify_underlying_publication_claims',
  'removal_only_publication_change_is_not_auto_promoted',
  'unstructured_source_change_requires_review'
];
for(const key of requiredIntegrity) assert(manifest.integrity?.[key]===true,`forward signal integrity invariant missing: ${key}`);

const registryPath=manifest.canonical?.forward_signal_source_registry?.path;
const policyPath=manifest.canonical?.forward_signal_review_policy?.path;
const statePath=manifest.runtime?.forward_signal_capture_state;
const reviewPath=manifest.runtime?.signal_review_ledger;
for(const [label,p] of [['source registry',registryPath],['review policy',policyPath],['capture state',statePath],['signal review ledger',reviewPath]]) assert(Boolean(p&&fs.existsSync(p)),`forward signal ${label} missing`);
if(fail.length){
  console.error('POLITICAL_MAYHEM_FORWARD_SIGNAL_INTEGRITY_FAILED');
  for(const m of fail)console.error('- '+m);
  process.exit(1);
}

const registry=read(registryPath);
const policy=read(policyPath);
const state=read(statePath);
const reviews=read(reviewPath);
const snapshots=read(manifest.runtime.source_snapshots);
const events=read(manifest.runtime.intelligence_events);
const watches=registry.sources||[];
const active=watches.filter(x=>x.active);
const jurisdictionIds=['AUS-FED','AUS-NSW','AUS-VIC','AUS-QLD','AUS-WA','AUS-SA','AUS-TAS','AUS-ACT','AUS-NT'];

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
assert(registry.rules?.capture_mode_changes_are_baseline_migrations_not_source_changes===true,'capture-mode migration firewall missing');
assert(registry.rules?.structured_publication_additions_may_be_deterministically_reviewed===true,'structured publication review rule missing');
assert(registry.rules?.legacy_possible_signal_records_are_retained_and_not_rewritten===true,'legacy signal retention rule missing');
assert(unique(watches.map(x=>x.watch_id)),'forward watcher IDs are not unique');
assert(unique(watches.map(x=>x.source_id)),'forward watcher source IDs are not unique');
for(const w of active){
  assert(w.watch_id&&w.source_id&&w.url&&w.source_class&&w.jurisdiction_id,`incomplete active forward watcher: ${w.watch_id||'UNKNOWN'}`);
  assert(['NORMALISED_PAGE_HASH','PUBLICATION_FEED_HASH'].includes(w.capture_mode),`${w.watch_id} has invalid capture mode ${w.capture_mode}`);
  assert(['REVIEW_UNSTRUCTURED_CHANGE','AUTO_PROMOTE_PUBLICATION_ADDITIONS'].includes(w.review_policy),`${w.watch_id} has invalid review policy ${w.review_policy}`);
  if(w.review_policy==='AUTO_PROMOTE_PUBLICATION_ADDITIONS') assert(w.capture_mode==='PUBLICATION_FEED_HASH',`${w.watch_id} auto-promotion policy is not backed by structured publication capture`);
}
for(const id of jurisdictionIds){
  const rows=active.filter(w=>w.jurisdiction_id===id);
  assert(rows.length>=3,`${id} has ${rows.length} active forward sources; expected at least 3`);
  assert(new Set(rows.map(w=>w.source_class)).size>=2,`${id} forward capture lacks source-class diversity`);
}
assert(active.length>=27,`active forward source count ${active.length} is below nine-field multi-source minimum`);

assert(policy.status==='ACTIVE','forward signal review policy is not active');
assert(policy.rules?.raw_source_change_never_auto_becomes_substantive_claim===true,'review policy permits raw source change to become substantive claim');
assert(policy.rules?.automatic_promotion_requires_structured_added_records===true,'review policy does not require structured additions');
assert(policy.rules?.automatic_promotion_does_not_validate_underlying_claim_content===true,'review policy improperly validates publication claim content');
assert(policy.rules?.removal_only_change_is_excluded_as_non_signal===true,'removal-only auto-promotion prohibition missing');
assert(policy.rules?.unstructured_page_change_requires_review===true,'unstructured page-change review rule missing');
assert(policy.rules?.projection_effect_is_always_no_effect_at_signal_promotion===true,'review policy permits projection effect at promotion');
assert(policy.rules?.materiality_is_not_inferred_by_deterministic_review===true,'deterministic review improperly infers materiality');

assert(state.status==='ACTIVE','forward signal capture state is not ACTIVE');
const failures=new Map((state.last_run?.failures||[]).map(x=>[x.watch_id,x.error]));
for(const w of active) assert(Boolean(state.sources?.[w.watch_id])||failures.has(w.watch_id),`active watcher has neither captured baseline nor explicit failure: ${w.watch_id}`);
if(state.coverage){
  assert(state.coverage.active_sources===active.length,`capture-state active source count ${state.coverage.active_sources} != registry ${active.length}`);
  for(const id of jurisdictionIds){
    const c=state.coverage.jurisdictions?.[id];
    assert(Boolean(c),`capture-state jurisdiction coverage missing: ${id}`);
    if(c){
      assert(c.configured_sources===active.filter(w=>w.jurisdiction_id===id).length,`${id} configured-source coverage mismatch`);
      assert(c.baseline_sources>=1,`${id} has no persisted forward baseline source`);
    }
  }
}

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
const reviewByChange=new Map(reviewRows.map(r=>[r.source_change_event_id,r]));
for(const e of eventRows) assert(snapshotIds.has(e.source_snapshot_id),`intelligence event references missing snapshot: ${e.event_id} -> ${e.source_snapshot_id}`);

const currentRegistrySnapshots=snapshotRows.filter(s=>s.source_registry_snapshot===registry.registry_id);
for(const s of currentRegistrySnapshots){
  assert(['NORMALISED_PAGE_HASH','PUBLICATION_FEED_HASH'].includes(s.capture_mode),`${s.snapshot_id} current-registry snapshot lacks valid capture mode`);
  assert(s.captured_representation_complete===true,`${s.snapshot_id} current-registry snapshot is not complete`);
  if(s.capture_mode==='PUBLICATION_FEED_HASH'){
    assert(Array.isArray(s.structured_records)&&s.structured_records.length>0,`${s.snapshot_id} publication snapshot lacks structured records`);
    assert(s.hash_basis==='COMPLETE_STRUCTURED_PUBLICATION_RECORD_SET',`${s.snapshot_id} publication snapshot has wrong hash basis`);
  }
}
const currentFirstBaselines=currentRegistrySnapshots.filter(s=>!s.previous_snapshot_id);
for(const s of currentFirstBaselines) assert(!eventRows.some(e=>['SOURCE_CHANGED','SIGNAL_CREATED'].includes(e.event_type)&&e.source_snapshot_id===s.snapshot_id),`first baseline incorrectly emitted a change/signal: ${s.snapshot_id}`);

for(const e of eventRows.filter(x=>String(x.event_id||'').startsWith('CHG-WATCH-'))){
  assert(e.event_type==='SOURCE_CHANGED',`${e.event_id} raw watcher event is not SOURCE_CHANGED`);
  assert(e.evidence_state==='VERIFIED',`${e.event_id} raw source change is not marked as verified observation`);
  assert(e.signal_state==='OBSERVED',`${e.event_id} raw source change is incorrectly classed as a political signal`);
  assert(e.semantic_review_state==='PENDING',`${e.event_id} raw source change was mutated after capture`);
  assert(e.materiality_state==='UNASSESSED',`${e.event_id} raw source change has premature materiality classification`);
  assert(e.inference===null&&e.inference_class==='NONE',`${e.event_id} raw source change contains inference`);
  assert(e.projection_effect==='NO_EFFECT',`${e.event_id} raw source change alters a projection`);
  assert(Boolean(e.before?.snapshot_id)&&Boolean(e.after?.snapshot_id),`${e.event_id} raw source change lacks snapshot lineage`);
  assert(Boolean(e.representation_delta?.delta_hash),`${e.event_id} raw source change lacks reproducible delta hash`);
  if(e.capture_mode==='PUBLICATION_FEED_HASH'&&e.review_policy==='AUTO_PROMOTE_PUBLICATION_ADDITIONS'){
    assert(e.representation_delta?.delta_type==='STRUCTURED_RECORD_SET',`${e.event_id} auto-reviewable feed change lacks structured delta`);
    const added=e.representation_delta?.records_added||[];
    const removed=e.representation_delta?.records_removed||[];
    if(added.length||removed.length) assert(reviewByChange.has(e.event_id),`${e.event_id} structured publication change was not deterministically reviewed`);
  }
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
  if(r.reviewer_mode==='DETERMINISTIC_RULE'){
    assert(r.policy_id===policy.policy_id,`${r.review_id} deterministic review has wrong policy lineage`);
    assert(sourceChange?.capture_mode==='PUBLICATION_FEED_HASH',`${r.review_id} deterministic review is not backed by publication-feed capture`);
    const added=sourceChange?.representation_delta?.records_added||[];
    const removed=sourceChange?.representation_delta?.records_removed||[];
    if(r.decision==='PROMOTED_TO_SIGNAL') assert(added.length>0,`${r.review_id} deterministically promoted without added records`);
    if(r.decision==='EXCLUDED_AS_NON_SIGNAL') assert(added.length===0&&removed.length>0,`${r.review_id} deterministic exclusion is not removal-only`);
  }
  if(r.decision==='PROMOTED_TO_SIGNAL'){
    const signal=eventById.get(r.signal_event_id);
    assert(Boolean(signal),`${r.review_id} promoted signal event is missing`);
    if(signal){
      assert(signal.event_type==='SIGNAL_CREATED',`${r.review_id} promoted event is not SIGNAL_CREATED`);
      assert(signal.parent_event_id===r.source_change_event_id,`${r.review_id} signal parent does not match raw source change`);
      assert(signal.review_id===r.review_id,`${r.review_id} signal does not retain review lineage`);
      assert(signal.projection_effect==='NO_EFFECT',`${r.review_id} promotion directly alters a projection`);
      if(r.reviewer_mode==='DETERMINISTIC_RULE'){
        assert(signal.integrity?.underlying_publication_claims_not_promoted_to_verified_fact===true,`${r.review_id} deterministic signal lacks substantive-claim firewall`);
        assert(signal.materiality_state==='UNKNOWN',`${r.review_id} deterministic signal improperly infers materiality`);
      }
    }
  }else assert(r.signal_event_id===null,`${r.review_id} excluded source change incorrectly has a signal event`);
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
