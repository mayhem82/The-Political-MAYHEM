import fs from 'node:fs';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const temporal=require('../engine/temporal.js');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const fail=[];
const assert=(condition,message)=>{if(!condition)fail.push(message)};
const sameInstant=(a,b)=>Date.parse(a)===Date.parse(b);

const contests=read('data/runtime/political-contests.json');
const checkpoints=read('data/runtime/contest-checkpoints.json');
const contest=(contests.contests||[]).find(x=>x.contest_id==='AUS-VIC-SE2026-GOVERNMENT');
const checkpointSet=(checkpoints.contests||[]).find(x=>x.contest_id==='AUS-VIC-SE2026-GOVERNMENT');

assert(Boolean(contest),'Victorian government-formation contest missing');
assert(Boolean(checkpointSet),'Victorian checkpoint set missing');
assert(JSON.stringify(temporal.CAPTURE_STATES)===JSON.stringify(['PENDING','CAPTURED_IN_WINDOW','CAPTURED_LATE_PRE_OUTCOME','MISSED_NOT_CAPTURED']),'capture-state vocabulary drifted');
assert(JSON.stringify(temporal.LIFECYCLE_STATES)===JSON.stringify(['UPCOMING','CONTEST_WINDOW','OUTCOME_VERIFICATION_PENDING','VERIFIED_OUTCOME']),'lifecycle vocabulary drifted');
assert(JSON.stringify(temporal.RELATIVE_CHECKPOINTS)===JSON.stringify([['T_7D',10080],['T_72H',4320],['T_24H',1440],['T_3H',180]]),'relative checkpoint schedule drifted');

if(contest&&checkpointSet){
  const close=contest.close_at;
  const open=contest.window_open_at;
  assert(Boolean(close),'contest close_at missing');
  assert(Boolean(open),'contest window_open_at missing');

  for(const [type,minutes] of temporal.RELATIVE_CHECKPOINTS){
    const row=(checkpointSet.checkpoints||[]).find(x=>x.checkpoint_type===type);
    assert(Boolean(row),`${type} checkpoint missing`);
    if(row) assert(sameInstant(row.scheduled_for,temporal.dueAt(close,minutes)),`${type} checkpoint no longer matches contest close`);
  }

  const openMs=Date.parse(open),closeMs=Date.parse(close);
  assert(temporal.lifecycleState({window_open_at:open,close_at:close,now:new Date(openMs-1)})==='UPCOMING','pre-window lifecycle incorrect');
  assert(temporal.lifecycleState({window_open_at:open,close_at:close,now:new Date(openMs)})==='CONTEST_WINDOW','window-open lifecycle incorrect');
  assert(temporal.lifecycleState({window_open_at:open,close_at:close,now:new Date(closeMs-1)})==='CONTEST_WINDOW','pre-close lifecycle incorrect');
  assert(temporal.lifecycleState({window_open_at:open,close_at:close,now:new Date(closeMs)})==='OUTCOME_VERIFICATION_PENDING','contest-close lifecycle incorrect');
  assert(temporal.lifecycleState({window_open_at:open,close_at:close,outcome_verified:true,now:new Date(closeMs+1)})==='VERIFIED_OUTCOME','verified-outcome lifecycle incorrect');

  const due=temporal.dueAt(close,1440);
  const dueMs=Date.parse(due);
  assert(temporal.captureState({due,close_at:close,captured_at:new Date(dueMs-60000).toISOString()})==='CAPTURED_IN_WINDOW','in-window capture classification incorrect');
  assert(temporal.captureState({due,close_at:close,captured_at:new Date(dueMs+60000).toISOString()})==='CAPTURED_LATE_PRE_OUTCOME','late pre-outcome capture classification incorrect');
  assert(temporal.captureState({due,close_at:close,now:new Date(closeMs+1)})==='MISSED_NOT_CAPTURED','missed capture classification incorrect');
  let blocked=false;
  try{temporal.captureState({due,close_at:close,captured_at:close});}catch(err){blocked=err?.message==='PRE_OUTCOME_CAPTURE_AT_OR_AFTER_CONTEST_CLOSE';}
  assert(blocked,'capture at contest close was not rejected');

  const t24=Date.parse(temporal.dueAt(close,1440));
  const crossed=temporal.dueSince(close,new Date(t24-1),new Date(t24));
  assert(crossed.length===1&&crossed[0].checkpoint==='T_24H','dueSince did not identify T_24H boundary');
}

if(fail.length){
  console.error('POLITICAL_MAYHEM_TEMPORAL_ENGINE_INTEGRITY_FAILED');
  for(const message of fail) console.error('- '+message);
  process.exit(1);
}
console.log('POLITICAL_MAYHEM_TEMPORAL_ENGINE_INTEGRITY_PASS','relativeCheckpoints=4','captureStates=4','lifecycleStates=4');
