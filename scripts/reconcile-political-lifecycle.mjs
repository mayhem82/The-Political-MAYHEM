import fs from 'node:fs';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const time=v=>{if(!v)return null;const n=Date.parse(v);return Number.isFinite(n)?n:null;};
const order={UPCOMING:0,CONTEST_WINDOW:1,OUTCOME_VERIFICATION_PENDING:2,VERIFIED_OUTCOME:3};

const contestsPath='data/runtime/political-contests.json';
const cyclesPath='data/runtime/political-cycles.json';
const checkpointsPath='data/runtime/contest-checkpoints.json';
const outcomesPath='data/runtime/verified-outcomes.json';
const contests=read(contestsPath);
const cycles=read(cyclesPath);
const checkpoints=read(checkpointsPath);
const outcomes=read(outcomesPath);
const nowDate=new Date(); const now=nowDate.toISOString(); const nowMs=nowDate.getTime();
const outcomesByContest=new Map();
for(const o of outcomes.outcomes||[]){
  if(o.verification_state!=='VERIFIED') continue;
  const prev=outcomesByContest.get(o.contest_id);
  if(!prev || Date.parse(o.recorded_at)>Date.parse(prev.recorded_at)) outcomesByContest.set(o.contest_id,o);
}
const checkpointByContest=new Map((checkpoints.contests||[]).map(x=>[x.contest_id,x]));
let changed=false;
const transitions=[];

function advance(contest,to,reason){
  if(order[to]<order[contest.status]) throw new Error(`STATUS_REGRESSION_BLOCKED ${contest.contest_id} ${contest.status}->${to}`);
  if(to===contest.status) return;
  const from=contest.status;
  contest.status=to;
  contest.updated_at=now;
  contest.lifecycle_history ||= [];
  contest.lifecycle_history.push({from,to,at:now,reason});
  const cp=checkpointByContest.get(contest.contest_id);
  if(cp) cp.lifecycle=to;
  transitions.push({contest_id:contest.contest_id,from,to,reason});
  changed=true;
}

for(const contest of contests.contests||[]){
  const verified=outcomesByContest.get(contest.contest_id);
  if(verified){
    if(contest.cycle_id!==verified.cycle_id) throw new Error(`OUTCOME_CYCLE_MISMATCH ${contest.contest_id}`);
    contest.verified_outcome_id=verified.outcome_id;
    advance(contest,'VERIFIED_OUTCOME','VERIFIED_OUTCOME_LEDGER_RECONCILIATION');
    continue;
  }

  const closeMs=time(contest.close_at??contest.outcome_expected_at);
  const openMs=time(contest.window_open_at);
  if(closeMs!=null && nowMs>=closeMs && order[contest.status]<order.OUTCOME_VERIFICATION_PENDING){
    advance(contest,'OUTCOME_VERIFICATION_PENDING','REGISTERED_CONTEST_CLOSE_REACHED_WITHOUT_VERIFIED_OUTCOME');
  }else if(openMs!=null && nowMs>=openMs && contest.status==='UPCOMING'){
    advance(contest,'CONTEST_WINDOW','REGISTERED_CONTEST_WINDOW_OPEN_REACHED');
  }

  const cp=checkpointByContest.get(contest.contest_id);
  if(cp && ['OUTCOME_VERIFICATION_PENDING','VERIFIED_OUTCOME'].includes(contest.status)){
    const boundary=closeMs??time(contest.scheduled_at);
    for(const checkpoint of cp.checkpoints||[]){
      if(checkpoint.capture_state!=='PENDING') continue;
      const due=time(checkpoint.scheduled_for);
      if(boundary!=null && due!=null && due<=boundary && nowMs>=boundary){
        checkpoint.capture_state='MISSED_NOT_CAPTURED';
        checkpoint.captured_at=now;
        checkpoint.evidence_cutoff=null;
        checkpoint.projection_state=checkpoint.projection_state==='NONE'?'ABSTAIN_INSUFFICIENT_EVIDENCE':checkpoint.projection_state;
        checkpoint.notes=`${checkpoint.notes?`${checkpoint.notes} `:''}Scheduled pre-outcome checkpoint was not captured before the registered contest boundary; no reconstruction performed.`;
        checkpoint.integrity ||= {};
        checkpoint.integrity.frozen_at=now;
        checkpoint.integrity.hindsight_changes_prohibited=true;
        checkpoint.integrity.retroactive_signal_backfill_prohibited=true;
        changed=true;
      }
    }
  }
}

for(const cycle of cycles.cycles||[]){
  const member=(contests.contests||[]).filter(c=>c.cycle_id===cycle.cycle_id);
  if(member.length===0) continue;
  if(member.every(c=>c.status==='VERIFIED_OUTCOME') && cycle.status==='ACTIVE'){
    cycle.status='OUTCOME_RECONCILIATION';
    cycle.updated_at=now;
    cycle.lifecycle_history ||= [];
    cycle.lifecycle_history.push({from:'ACTIVE',to:'OUTCOME_RECONCILIATION',at:now,reason:'ALL_REGISTERED_CONTESTS_VERIFIED'});
    changed=true;
  }
}

if(changed){
  contests.updated_at=now;
  cycles.updated_at=now;
  checkpoints.generated_at=now;
  write(contestsPath,contests);
  write(cyclesPath,cycles);
  write(checkpointsPath,checkpoints);
}
console.log(JSON.stringify({changed,transitions,reconciled_at:now}));
