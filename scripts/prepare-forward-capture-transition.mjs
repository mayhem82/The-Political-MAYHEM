import fs from 'node:fs';

const REGISTER='data/forward-capture-transition-register.json';
const STATE='data/runtime/forward-signal-capture-state.json';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');

const transition=read(REGISTER);
const state=read(STATE);
state.sources ||= {};
const ids=new Set(transition.snapshot_ids||[]);
let marked=0;
for(const [watchId,s] of Object.entries(state.sources)){
  if(!ids.has(s?.snapshot_id)) continue;
  if(s.capture_mode==='TRANSITIONAL_PUBLICATION_HASH'&&s.transition_rebaseline_required===true) continue;
  state.sources[watchId]={
    ...s,
    capture_mode:'TRANSITIONAL_PUBLICATION_HASH',
    transition_rebaseline_required:true,
    transition_register_id:transition.register_id
  };
  marked++;
}
if(marked){
  state.transition_rebaseline={
    register_id:transition.register_id,
    marked_at:new Date().toISOString(),
    marked_sources:marked,
    rule:'Transition pointer metadata only. Historical source snapshots are not mutated. The next successful capture must create a new structured baseline linked to the transition snapshot and must not emit SOURCE_CHANGED or SIGNAL_CREATED.'
  };
  write(STATE,state);
}
console.log(`FORWARD_CAPTURE_TRANSITION_PREPARED marked=${marked}`);
