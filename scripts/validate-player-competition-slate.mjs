import fs from 'node:fs';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const fail=[];
const assert=(condition,message)=>{if(!condition)fail.push(message)};
const unique=values=>new Set(values).size===values.length;
const validTime=v=>Number.isFinite(Date.parse(v));

const slate=read('data/runtime/player-competition-slate.json');
const contests=read('data/runtime/political-contests.json');
const cycles=read('data/runtime/political-cycles.json');
const snapshots=read('data/runtime/source-snapshots.json');

assert(slate.status==='ACTIVE','player competition slate is not ACTIVE');
assert(slate.rules?.one_player_may_have_multiple_contest_entries===true,'multi-contest player rule missing');
assert(slate.rules?.one_player_may_span_multiple_competition_classes===true,'multi-class player rule missing');
assert(slate.rules?.parliamentary_roster_does_not_create_contest_entry===true,'roster must not create contest entry');
assert(slate.rules?.contest_entry_requires_registered_contest===true,'registered-contest requirement missing');
assert(slate.rules?.participation_requires_source_lineage===true,'participation source-lineage rule missing');
assert(slate.rules?.result_requires_verified_contest_outcome===true,'verified-result rule missing');
assert(slate.rules?.position_changes_are_append_only_history===true,'append-only position-history rule missing');
assert(slate.rules?.no_hindsight_backfill===true,'hindsight-backfill prohibition missing');

const contestById=new Map((contests.contests||[]).map(x=>[x.contest_id,x]));
const cycleById=new Map((cycles.cycles||[]).map(x=>[x.cycle_id,x]));
const snapshotIds=new Set((snapshots.snapshots||[]).map(x=>x.snapshot_id));
const roles=new Set(slate.allowed?.participation_role||[]);
const sides=new Set(slate.allowed?.side||[]);
const participationStates=new Set(slate.allowed?.participation_state||[]);
const resultStates=new Set(slate.allowed?.result_state||[]);
const decidedResults=new Set(['WIN','LOSS','PARTIAL','VOID']);

const entries=slate.entries||[];
assert(unique(entries.map(x=>x.entry_id)),'player competition entry IDs are not unique');
assert(unique(entries.map(x=>`${x.actor_id}|${x.contest_id}`)),'player has duplicate entry for the same contest');

for(const entry of entries){
  assert(Boolean(entry.entry_id),`entry missing entry_id for ${entry.actor_id||'UNKNOWN'}`);
  assert(Boolean(entry.actor_id),`${entry.entry_id||'UNKNOWN'}: actor_id missing`);
  const contest=contestById.get(entry.contest_id);
  assert(Boolean(contest),`${entry.entry_id}: unknown contest ${entry.contest_id}`);
  const cycle=cycleById.get(entry.cycle_id);
  assert(Boolean(cycle),`${entry.entry_id}: unknown cycle ${entry.cycle_id}`);
  if(contest){
    assert(entry.cycle_id===contest.cycle_id,`${entry.entry_id}: cycle does not match contest`);
    assert(entry.competition_class===contest.competition_class,`${entry.entry_id}: competition class does not match contest`);
  }
  assert(roles.has(entry.participation_role),`${entry.entry_id}: invalid participation_role`);
  assert(sides.has(entry.side),`${entry.entry_id}: invalid side`);
  assert(participationStates.has(entry.participation_state),`${entry.entry_id}: invalid participation_state`);
  assert(resultStates.has(entry.result_state),`${entry.entry_id}: invalid result_state`);
  const refs=Array.isArray(entry.source_snapshot_ids)?entry.source_snapshot_ids:[];
  assert(refs.length>0,`${entry.entry_id}: source_snapshot_ids required`);
  assert(unique(refs),`${entry.entry_id}: source_snapshot_ids contain duplicates`);
  for(const ref of refs) assert(snapshotIds.has(ref),`${entry.entry_id}: unknown source snapshot ${ref}`);
  assert(validTime(entry.created_at),`${entry.entry_id}: created_at invalid`);
  assert(validTime(entry.updated_at),`${entry.entry_id}: updated_at invalid`);
  if(validTime(entry.created_at)&&validTime(entry.updated_at)) assert(Date.parse(entry.updated_at)>=Date.parse(entry.created_at),`${entry.entry_id}: updated_at before created_at`);
  assert(Array.isArray(entry.participation_history),`${entry.entry_id}: participation_history must be an array`);
  if(decidedResults.has(entry.result_state)){
    assert(contest?.status==='VERIFIED_OUTCOME',`${entry.entry_id}: decided result exists before verified contest outcome`);
    assert(Boolean(contest?.verified_outcome_id),`${entry.entry_id}: decided result lacks verified outcome lineage`);
  }
}

if(fail.length){
  console.error('POLITICAL_MAYHEM_PLAYER_COMPETITION_SLATE_INTEGRITY_FAILED');
  for(const message of fail) console.error('- '+message);
  process.exit(1);
}
console.log('POLITICAL_MAYHEM_PLAYER_COMPETITION_SLATE_INTEGRITY_PASS',`entries=${entries.length}`,`players=${new Set(entries.map(x=>x.actor_id)).size}`,'duplicateContestEntries=0');
