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
  'forward_signal_seed_identity_collisions_are_rejected'
]) assert(manifest.integrity?.[key]===true,`forward signal integrity invariant missing: ${key}`);

const registryPath=manifest.canonical?.forward_signal_source_registry?.path;
const statePath=manifest.runtime?.forward_signal_capture_state;
assert(Boolean(registryPath&&fs.existsSync(registryPath)),'forward signal source registry missing');
assert(Boolean(statePath&&fs.existsSync(statePath)),'forward signal capture state missing');
if(!registryPath||!statePath||!fs.existsSync(registryPath)||!fs.existsSync(statePath)){
  console.error('POLITICAL_MAYHEM_FORWARD_SIGNAL_INTEGRITY_FAILED');
  for(const m of fail)console.error('- '+m);
  process.exit(1);
}

const registry=read(registryPath);
const state=read(statePath);
const snapshots=read(manifest.runtime.source_snapshots);
const events=read(manifest.runtime.intelligence_events);
const watches=registry.sources||[];
const active=watches.filter(x=>x.active);
assert(/^ACTIVE/.test(registry.status||''),'forward signal source registry is not active');
assert(registry.capture_cadence==='HOURLY','forward signal source registry cadence is not hourly');
assert(registry.rules?.forward_only===true,'forward signal registry is not forward-only');
assert(registry.rules?.source_change_is_a_possible_signal_not_a_substantive_fact===true,'source-change semantic boundary missing');
assert(registry.rules?.semantic_promotion_requires_source_specific_extraction_or_review===true,'semantic promotion evidence rule missing');
assert(registry.rules?.same_hash_must_not_create_duplicate_signal===true,'same-hash duplicate prohibition missing');
assert(registry.rules?.first_capture_establishes_baseline===true,'first-capture baseline rule missing');
assert(unique(watches.map(x=>x.watch_id)),'forward watcher IDs are not unique');
assert(unique(watches.map(x=>x.source_id)),'forward watcher source IDs are not unique');
for(const w of active) assert(w.watch_id&&w.source_id&&w.url&&w.source_class&&w.jurisdiction_id,`incomplete active forward watcher: ${w.watch_id||'UNKNOWN'}`);
assert(state.status==='ACTIVE','forward signal capture state is not ACTIVE');

const failures=new Map((state.last_run?.failures||[]).map(x=>[x.watch_id,x.error]));
for(const w of active){
  assert(Boolean(state.sources?.[w.watch_id])||failures.has(w.watch_id),`active watcher has neither captured baseline nor explicit failure: ${w.watch_id}`);
}

const snapshotRows=snapshots.snapshots||[];
const eventRows=events.events||[];
assert(snapshots.mode==='FORWARD_ONLY','source snapshot ledger is not forward-only');
assert(events.mode==='FORWARD_ONLY','intelligence event ledger is not forward-only');
assert(unique(snapshotRows.map(x=>x.snapshot_id)),'source snapshot IDs are not unique');
assert(unique(eventRows.map(x=>x.event_id)),'intelligence event IDs are not unique');
const snapshotIds=new Set(snapshotRows.map(x=>x.snapshot_id));
for(const e of eventRows) assert(snapshotIds.has(e.source_snapshot_id),`intelligence event references missing snapshot: ${e.event_id} -> ${e.source_snapshot_id}`);

const autoFirstBaselines=snapshotRows.filter(s=>s.source_registry_snapshot===registry.registry_id&&!s.previous_snapshot_id);
for(const s of autoFirstBaselines){
  assert(!eventRows.some(e=>e.event_type==='SIGNAL_CREATED'&&e.source_snapshot_id===s.snapshot_id),`automated first baseline incorrectly emitted signal: ${s.snapshot_id}`);
}
for(const e of eventRows.filter(x=>String(x.event_id||'').startsWith('SIG-WATCH-'))){
  assert(e.event_type==='SIGNAL_CREATED',`${e.event_id} automated change event type is not SIGNAL_CREATED`);
  assert(e.evidence_state==='SIGNAL',`${e.event_id} automated source change is incorrectly promoted beyond SIGNAL`);
  assert(e.signal_state==='POSSIBLE_SIGNAL',`${e.event_id} automated source change is incorrectly promoted beyond POSSIBLE_SIGNAL`);
  assert(e.inference===null&&e.inference_class==='NONE',`${e.event_id} automated source change contains inference`);
  assert(e.projection_effect==='NO_EFFECT',`${e.event_id} automated source change alters projection without semantic promotion`);
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
console.log('POLITICAL_MAYHEM_FORWARD_SIGNAL_INTEGRITY_PASS',`watchers=${watches.length}`,`active=${active.length}`,`baselines=${Object.keys(state.sources||{}).length}`,`explicitFailures=${failures.size}`,`snapshots=${snapshotRows.length}`,`events=${eventRows.length}`,`signals=${eventRows.filter(x=>x.event_type==='SIGNAL_CREATED').length}`);
