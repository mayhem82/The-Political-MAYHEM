import fs from 'node:fs';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const fail=[];
const assert=(condition,message)=>{if(!condition)fail.push(message)};
const unique=values=>new Set(values).size===values.length;
const validTime=value=>Number.isFinite(Date.parse(value));

const ledger=read('data/runtime/competition-events.json');
const contests=read('data/runtime/political-contests.json');
const cycles=read('data/runtime/political-cycles.json');
const snapshots=read('data/runtime/source-snapshots.json');

assert(ledger.status==='ACTIVE','competition event ledger is not ACTIVE');
for(const rule of ['event_requires_registered_contest','event_requires_source_lineage','event_is_observation_before_inference','event_does_not_rewrite_prior_event','event_does_not_change_verified_outcome_retroactively','player_and_team_effects_require_explicit_lineage','cross_competition_effects_are_not_implicit','no_hindsight_backfill']){
  assert(ledger.rules?.[rule]===true,`competition event invariant missing: ${rule}`);
}

const contestById=new Map((contests.contests||[]).map(x=>[x.contest_id,x]));
const cycleById=new Map((cycles.cycles||[]).map(x=>[x.cycle_id,x]));
const snapshotIds=new Set((snapshots.snapshots||[]).map(x=>x.snapshot_id));
const eventTypes=new Map(Object.entries(ledger.allowed_event_types||{}).map(([key,values])=>[key,new Set(values)]));
const sides=new Set(ledger.allowed?.side||[]);
const evidenceStates=new Set(ledger.allowed?.evidence_state||[]);
const competitionEffects=new Set(ledger.allowed?.competition_effect||[]);
const projectionEffects=new Set(ledger.allowed?.projection_effect||[]);

assert(eventTypes.has('ELECTORAL'),'ELECTORAL event vocabulary missing');
assert(eventTypes.has('LEGISLATIVE'),'LEGISLATIVE event vocabulary missing');
for(const required of ['INTRODUCTION','AMENDMENT','COMMITTEE_STAGE','PARTY_ROOM_POSITION','CROSSBENCH_NEGOTIATION','PROCEDURAL_MOVE','DIVISION_OR_VOTE','WITHDRAWAL','PASSAGE_STATUS_EVENT']){
  assert(eventTypes.get('LEGISLATIVE')?.has(required),`legislative event type missing: ${required}`);
}

const events=ledger.events||[];
assert(unique(events.map(x=>x.event_id)),'competition event IDs are not unique');

for(const event of events){
  assert(Boolean(event.event_id),'competition event missing event_id');
  const contest=contestById.get(event.contest_id);
  assert(Boolean(contest),`${event.event_id}: unknown contest ${event.contest_id}`);
  const cycle=cycleById.get(event.cycle_id);
  assert(Boolean(cycle),`${event.event_id}: unknown cycle ${event.cycle_id}`);
  if(contest){
    assert(event.cycle_id===contest.cycle_id,`${event.event_id}: cycle does not match contest`);
    assert(event.competition_class===contest.competition_class,`${event.event_id}: competition class does not match contest`);
  }
  assert(eventTypes.get(event.competition_class)?.has(event.event_type)===true,`${event.event_id}: invalid ${event.competition_class} event type ${event.event_type}`);
  assert(validTime(event.occurred_at),`${event.event_id}: occurred_at invalid`);
  assert(validTime(event.captured_at),`${event.event_id}: captured_at invalid`);
  if(validTime(event.occurred_at)&&validTime(event.captured_at)) assert(Date.parse(event.captured_at)>=Date.parse(event.occurred_at),`${event.event_id}: captured before event occurred`);
  const partyIds=Array.isArray(event.party_ids)?event.party_ids:[];
  const actorIds=Array.isArray(event.actor_ids)?event.actor_ids:[];
  assert(unique(partyIds),`${event.event_id}: duplicate party_ids`);
  assert(unique(actorIds),`${event.event_id}: duplicate actor_ids`);
  assert(sides.has(event.side),`${event.event_id}: invalid side`);
  assert(typeof event.observation==='string'&&event.observation.trim().length>0,`${event.event_id}: observation missing`);
  assert(evidenceStates.has(event.evidence_state),`${event.event_id}: invalid evidence_state`);
  const refs=Array.isArray(event.source_snapshot_ids)?event.source_snapshot_ids:[];
  assert(refs.length>0,`${event.event_id}: source_snapshot_ids required`);
  assert(unique(refs),`${event.event_id}: duplicate source_snapshot_ids`);
  for(const ref of refs) assert(snapshotIds.has(ref),`${event.event_id}: unknown source snapshot ${ref}`);
  assert(competitionEffects.has(event.competition_effect),`${event.event_id}: invalid competition_effect`);
  assert(projectionEffects.has(event.projection_effect),`${event.event_id}: invalid projection_effect`);
  if(event.competition_effect!=='NO_EFFECT') assert(event.evidence_state==='VERIFIED',`${event.event_id}: competition effect requires VERIFIED evidence`);
  if(event.projection_effect!=='NO_EFFECT'){
    assert(event.competition_effect!=='NO_EFFECT',`${event.event_id}: projection effect without competition effect`);
    assert(Boolean(contest?.current_projection_id),`${event.event_id}: projection effect without registered current projection`);
  }
  if(event.competition_effect==='ADVANTAGE_SUPPORTING') assert(['SUPPORTING','NEUTRAL_OR_UNRESOLVED'].includes(event.side),`${event.event_id}: supporting advantage conflicts with event side`);
  if(event.competition_effect==='ADVANTAGE_OPPOSING') assert(['OPPOSING','NEUTRAL_OR_UNRESOLVED'].includes(event.side),`${event.event_id}: opposing advantage conflicts with event side`);
}

if(fail.length){
  console.error('POLITICAL_MAYHEM_COMPETITION_EVENT_INTEGRITY_FAILED');
  for(const message of fail) console.error('- '+message);
  process.exit(1);
}
console.log('POLITICAL_MAYHEM_COMPETITION_EVENT_INTEGRITY_PASS',`events=${events.length}`,`electoralTypes=${eventTypes.get('ELECTORAL')?.size||0}`,`legislativeTypes=${eventTypes.get('LEGISLATIVE')?.size||0}`);
