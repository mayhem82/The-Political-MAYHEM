'use strict';

const RELATIVE_CHECKPOINTS=[['T_7D',10080],['T_72H',4320],['T_24H',1440],['T_3H',180]];
const CAPTURE_STATES=['PENDING','CAPTURED_IN_WINDOW','CAPTURED_LATE_PRE_OUTCOME','MISSED_NOT_CAPTURED'];
const LIFECYCLE_STATES=['UPCOMING','CONTEST_WINDOW','OUTCOME_VERIFICATION_PENDING','VERIFIED_OUTCOME'];

function ms(v){
  const n=new Date(v).getTime();
  if(!Number.isFinite(n)) throw new Error('INVALID_TIMESTAMP');
  return n;
}

function minutesToClose(closeAt,now=new Date()){
  return (ms(closeAt)-ms(now))/60000;
}

function dueAt(closeAt,minutes){
  return new Date(ms(closeAt)-minutes*60000).toISOString();
}

function captureState({due,close_at,captured_at,now=new Date()}){
  const d=ms(due),close=ms(close_at),n=ms(now);
  if(captured_at){
    const captured=ms(captured_at);
    if(captured>=close) throw new Error('PRE_OUTCOME_CAPTURE_AT_OR_AFTER_CONTEST_CLOSE');
    return captured<=d?'CAPTURED_IN_WINDOW':'CAPTURED_LATE_PRE_OUTCOME';
  }
  if(n<close) return 'PENDING';
  return 'MISSED_NOT_CAPTURED';
}

function lifecycleState({window_open_at,close_at,outcome_verified=false,now=new Date()}){
  if(outcome_verified) return 'VERIFIED_OUTCOME';
  const n=ms(now),open=ms(window_open_at),close=ms(close_at);
  if(n>=close) return 'OUTCOME_VERIFICATION_PENDING';
  if(n>=open) return 'CONTEST_WINDOW';
  return 'UPCOMING';
}

function checkpointState(closeAt,now=new Date()){
  const minutes=minutesToClose(closeAt,now);
  if(minutes<0) return {checkpoint:'POST',minutes_to_close:minutes};
  for(const [checkpoint,min] of RELATIVE_CHECKPOINTS){
    if(minutes>=min) return {checkpoint,minutes_to_close:minutes};
  }
  return {checkpoint:'POLL_CLOSE',minutes_to_close:minutes};
}

function dueSince(closeAt,previousRun,currentRun=new Date()){
  const close=ms(closeAt),previous=ms(previousRun),current=ms(currentRun);
  return RELATIVE_CHECKPOINTS
    .filter(([,minutes])=>{
      const due=close-minutes*60000;
      return due>previous&&due<=current;
    })
    .map(([checkpoint,minutes])=>({
      checkpoint,
      minutes_before_close:minutes,
      due_at:new Date(close-minutes*60000).toISOString()
    }));
}

function reconcileCheckpoints({close_at,checkpoints,now=new Date()}){
  return checkpoints.map(checkpoint=>{
    if(!checkpoint.scheduled_for) return {...checkpoint};
    const status=checkpoint.capture_state&&checkpoint.capture_state!=='PENDING'
      ?checkpoint.capture_state
      :captureState({
        due:checkpoint.scheduled_for,
        close_at,
        captured_at:checkpoint.captured_at||null,
        now
      });
    return {...checkpoint,capture_state:status};
  });
}

module.exports={
  RELATIVE_CHECKPOINTS,
  CAPTURE_STATES,
  LIFECYCLE_STATES,
  minutesToClose,
  dueAt,
  captureState,
  lifecycleState,
  checkpointState,
  dueSince,
  reconcileCheckpoints
};
