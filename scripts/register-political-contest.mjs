import fs from 'node:fs';

const inputPath=process.argv[2];
if(!inputPath) throw new Error('usage: node scripts/register-political-contest.mjs <contest-input.json>');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const validTime=(v,label)=>{if(v==null)return null;const n=Date.parse(v);if(!Number.isFinite(n))throw new Error(`${label} must be a valid date-time`);return n;};
const compact=d=>d.toISOString().replace(/[-:.TZ]/g,'').slice(0,14);

const cyclesPath='data/runtime/political-cycles.json';
const contestsPath='data/runtime/political-contests.json';
const checkpointsPath='data/runtime/contest-checkpoints.json';
const snapshotsPath='data/runtime/source-snapshots.json';
const cycles=read(cyclesPath);
const contests=read(contestsPath);
const checkpoints=read(checkpointsPath);
const snapshots=new Map((read(snapshotsPath).snapshots||[]).map(x=>[x.snapshot_id,x]));
const input=read(inputPath);
const nowDate=new Date(); const now=nowDate.toISOString();

if(!input.contest_id) throw new Error('contest_id is required');
if((contests.contests||[]).some(x=>x.contest_id===input.contest_id)) throw new Error(`contest_id already exists: ${input.contest_id}`);
if(!input.cycle_id) throw new Error('cycle_id is required');
const cycle=(cycles.cycles||[]).find(x=>x.cycle_id===input.cycle_id);
if(!cycle) throw new Error(`unknown cycle_id ${input.cycle_id}`);
if(!['PLANNED','ACTIVE'].includes(cycle.status)) throw new Error(`cycle ${input.cycle_id} is not open for new contests: ${cycle.status}`);
if(!input.jurisdiction) throw new Error('jurisdiction is required');
if(input.jurisdiction!==cycle.jurisdiction) throw new Error('contest jurisdiction must match cycle jurisdiction');
if(!input.contest_type) throw new Error('contest_type is required');
const status=input.status||'UPCOMING';
if(!['UPCOMING','CONTEST_WINDOW'].includes(status)) throw new Error('new contest status must be UPCOMING or CONTEST_WINDOW');
for(const [k,v] of [['scheduled_at',input.scheduled_at],['window_open_at',input.window_open_at],['close_at',input.close_at],['outcome_expected_at',input.outcome_expected_at],['evidence_cutoff',input.evidence_cutoff]]) validTime(v,k);
if(input.window_open_at&&input.close_at&&Date.parse(input.close_at)<Date.parse(input.window_open_at)) throw new Error('close_at cannot precede window_open_at');
if(!Array.isArray(input.source_snapshot_ids)||input.source_snapshot_ids.length===0) throw new Error('source_snapshot_ids is required');
for(const id of input.source_snapshot_ids){const s=snapshots.get(id);if(!s)throw new Error(`unknown source snapshot ${id}`);if(validTime(s.captured_at,`${id}.captured_at`)>nowDate.getTime())throw new Error(`source snapshot ${id} has future captured_at`);}

const contest={
  contest_id:input.contest_id,
  cycle_id:input.cycle_id,
  jurisdiction:input.jurisdiction,
  contest_type:input.contest_type,
  name:input.name||input.contest_id,
  electorate_or_scope:input.electorate_or_scope??null,
  scheduled_at:input.scheduled_at??null,
  window_open_at:input.window_open_at??null,
  close_at:input.close_at??null,
  outcome_expected_at:input.outcome_expected_at??null,
  evidence_cutoff:input.evidence_cutoff??now,
  status,
  party_ids:[...new Set(input.party_ids||[])],
  actor_ids:[...new Set(input.actor_ids||[])],
  current_projection_id:null,
  verified_outcome_id:null,
  source_refs:[...new Set(input.source_snapshot_ids)],
  created_at:now,
  updated_at:now,
  lifecycle_history:[{from:null,to:status,at:now,reason:'REGISTERED_FROM_CONTEMPORANEOUS_SOURCE_SNAPSHOTS'}]
};
contests.contests ||= [];
contests.contests.push(contest);
contests.updated_at=now;
cycle.contest_ids ||= [];
if(!cycle.contest_ids.includes(contest.contest_id)) cycle.contest_ids.push(contest.contest_id);
cycle.updated_at=now;
cycles.updated_at=now;
checkpoints.contests ||= [];
checkpoints.contests.push({
  contest_id:contest.contest_id,
  cycle_id:contest.cycle_id,
  lifecycle:contest.status,
  checkpoints:[{
    checkpoint_id:`CP-${contest.contest_id}-BASELINE-${compact(nowDate)}`,
    contest_id:contest.contest_id,
    cycle_id:contest.cycle_id,
    checkpoint_type:'BASELINE',
    scheduled_for:null,
    captured_at:now,
    evidence_cutoff:contest.evidence_cutoff,
    capture_state:'CAPTURED_IN_WINDOW',
    source_snapshot_ids:[...contest.source_refs],
    intelligence_event_ids:[],
    evidence_state:input.evidence_state||'VERIFIED',
    open_conflict_ids:[],
    projection_id:null,
    projection_state:'NONE',
    notes:'Baseline checkpoint created at contest registration from contemporaneous source snapshots.',
    integrity:{frozen_at:now,hindsight_changes_prohibited:true,retroactive_signal_backfill_prohibited:true}
  }]
});
checkpoints.generated_at=now;
write(cyclesPath,cycles); write(contestsPath,contests); write(checkpointsPath,checkpoints);
console.log(`POLITICAL_CONTEST_REGISTERED ${contest.contest_id} cycle=${contest.cycle_id} status=${status} sources=${contest.source_refs.length}`);
