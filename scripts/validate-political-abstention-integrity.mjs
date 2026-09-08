import fs from 'node:fs';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const fail=[];
const assert=(condition,message)=>{if(!condition)fail.push(message)};
const asTime=(value,label)=>{
  const time=Date.parse(value);
  if(!Number.isFinite(time)){fail.push(`${label} must be a valid date-time`);return null;}
  return time;
};

const checkpoints=read('data/runtime/contest-checkpoints.json');
const snapshots=read('data/runtime/source-snapshots.json');
const events=read('data/runtime/intelligence-events.json');
const snapshotById=new Map((snapshots.snapshots||[]).map(row=>[row.snapshot_id,row]));
const eventById=new Map((events.events||[]).map(row=>[row.event_id,row]));
const abstentions=[];

for(const contest of checkpoints.contests||[]){
  for(const checkpoint of contest.checkpoints||[]){
    if(checkpoint.projection_state!=='ABSTAIN_INSUFFICIENT_EVIDENCE') continue;
    abstentions.push(checkpoint);
    assert(checkpoint.projection_id==null,`${checkpoint.checkpoint_id}: abstention cannot carry projection_id`);
    assert(['CAPTURED_IN_WINDOW','CAPTURED_LATE_PRE_OUTCOME'].includes(checkpoint.capture_state),`${checkpoint.checkpoint_id}: abstention must be a captured pre-outcome checkpoint`);
    const captured=asTime(checkpoint.captured_at,`${checkpoint.checkpoint_id}.captured_at`);
    const cutoff=asTime(checkpoint.evidence_cutoff,`${checkpoint.checkpoint_id}.evidence_cutoff`);
    const frozen=asTime(checkpoint.integrity?.frozen_at,`${checkpoint.checkpoint_id}.integrity.frozen_at`);
    if(captured!=null&&cutoff!=null) assert(cutoff<=captured,`${checkpoint.checkpoint_id}: evidence cutoff is after capture`);
    if(captured!=null&&frozen!=null) assert(frozen>=captured,`${checkpoint.checkpoint_id}: frozen_at is before capture`);
    assert(checkpoint.integrity?.hindsight_changes_prohibited===true,`${checkpoint.checkpoint_id}: hindsight protection missing`);
    assert(checkpoint.integrity?.retroactive_signal_backfill_prohibited===true,`${checkpoint.checkpoint_id}: retroactive backfill protection missing`);
    assert(Array.isArray(checkpoint.source_snapshot_ids)&&checkpoint.source_snapshot_ids.length>0,`${checkpoint.checkpoint_id}: abstention requires source snapshots`);
    assert(typeof checkpoint.notes==='string'&&checkpoint.notes.toLowerCase().includes('insufficient'),`${checkpoint.checkpoint_id}: abstention notes must state insufficiency`);

    for(const id of checkpoint.source_snapshot_ids||[]){
      const snapshot=snapshotById.get(id);
      assert(Boolean(snapshot),`${checkpoint.checkpoint_id}: unknown source snapshot ${id}`);
      if(snapshot&&cutoff!=null){
        const capturedAt=asTime(snapshot.captured_at,`${id}.captured_at`);
        if(capturedAt!=null) assert(capturedAt<=cutoff,`${checkpoint.checkpoint_id}: source snapshot ${id} postdates evidence cutoff`);
      }
    }
    for(const id of checkpoint.intelligence_event_ids||[]){
      const event=eventById.get(id);
      assert(Boolean(event),`${checkpoint.checkpoint_id}: unknown intelligence event ${id}`);
      if(!event) continue;
      assert(event.event_type!=='SOURCE_CHANGED',`${checkpoint.checkpoint_id}: raw SOURCE_CHANGED event ${id} entered abstention lineage`);
      if(cutoff!=null){
        const capturedAt=asTime(event.captured_at,`${id}.captured_at`);
        if(capturedAt!=null) assert(capturedAt<=cutoff,`${checkpoint.checkpoint_id}: intelligence event ${id} postdates evidence cutoff`);
      }
    }
  }
}

if(fail.length){
  console.error('POLITICAL_MAYHEM_ABSTENTION_INTEGRITY_FAILED');
  for(const message of fail) console.error('- '+message);
  process.exit(1);
}
console.log('POLITICAL_MAYHEM_ABSTENTION_INTEGRITY_PASS',`abstentions=${abstentions.length}`);
