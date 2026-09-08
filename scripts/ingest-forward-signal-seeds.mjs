import fs from 'node:fs';
import path from 'node:path';

const SEED_DIR='data/forward-signal-seeds';
const SNAPSHOTS='data/runtime/source-snapshots.json';
const EVENTS='data/runtime/intelligence-events.json';
const MANIFEST='data/runtime/forward-ingestion-manifest.json';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

const snapshots=read(SNAPSHOTS);
const events=read(EVENTS);
const manifest=read(MANIFEST);
snapshots.snapshots ||= [];
events.events ||= [];
const snapshotById=new Map(snapshots.snapshots.map(x=>[x.snapshot_id,x]));
const eventById=new Map(events.events.map(x=>[x.event_id,x]));
let addedSnapshots=0,addedEvents=0;
let latestCapture=null;

const files=fs.existsSync(SEED_DIR)?fs.readdirSync(SEED_DIR).filter(f=>f.endsWith('.json')).sort():[];
for(const file of files){
  const seed=read(path.join(SEED_DIR,file));
  if(seed.mode!=='FORWARD_ONLY') throw new Error(`${file}: seed mode must be FORWARD_ONLY`);
  for(const snap of seed.snapshots||[]){
    if(!snap.snapshot_id||!snap.source_url||!snap.captured_at||!snap.content_hash) throw new Error(`${file}: incomplete source snapshot`);
    const prior=snapshotById.get(snap.snapshot_id);
    if(prior){
      if(!same(prior,snap)) throw new Error(`${file}: snapshot ID collision with changed content: ${snap.snapshot_id}`);
      continue;
    }
    snapshots.snapshots.push(snap); snapshotById.set(snap.snapshot_id,snap); addedSnapshots++;
    if(!latestCapture||Date.parse(snap.captured_at)>Date.parse(latestCapture)) latestCapture=snap.captured_at;
  }
  for(const event of seed.events||[]){
    if(!event.event_id||!event.source_snapshot_id||!event.captured_at||!event.event_type||!event.signal_state) throw new Error(`${file}: incomplete intelligence event`);
    if(!snapshotById.has(event.source_snapshot_id)) throw new Error(`${file}: event ${event.event_id} references missing snapshot ${event.source_snapshot_id}`);
    if(event.inference!==null&&event.inference_class==='NONE') throw new Error(`${file}: event ${event.event_id} has inference text with inference_class NONE`);
    const prior=eventById.get(event.event_id);
    if(prior){
      if(!same(prior,event)) throw new Error(`${file}: event ID collision with changed content: ${event.event_id}`);
      continue;
    }
    events.events.push(event); eventById.set(event.event_id,event); addedEvents++;
    if(!latestCapture||Date.parse(event.captured_at)>Date.parse(latestCapture)) latestCapture=event.captured_at;
  }
}

if(addedSnapshots||addedEvents){
  const stamp=latestCapture||new Date().toISOString();
  snapshots.scope='Australia — multi-jurisdiction';
  snapshots.captured_at=stamp;
  events.scope='Australia — multi-jurisdiction';
  events.captured_at=stamp;
  manifest.updated_at=stamp;
  manifest.live_evidence_ingestion ||= {};
  manifest.live_evidence_ingestion.running=true;
  manifest.live_evidence_ingestion.source_snapshots_ingested=snapshots.snapshots.length;
  manifest.live_evidence_ingestion.intelligence_events_ingested=events.events.length;
  manifest.live_evidence_ingestion.signals_ingested=events.events.filter(x=>x.event_type==='SIGNAL_CREATED').length;
  manifest.live_evidence_ingestion.last_capture_at=stamp;
  manifest.status='LIVE_INGESTION_ACTIVE_FORWARD_SIGNAL_CAPTURE_RUNNING';
  write(SNAPSHOTS,snapshots);write(EVENTS,events);write(MANIFEST,manifest);
}
console.log(`FORWARD_SIGNAL_SEEDS_INGESTED files=${files.length} snapshots_added=${addedSnapshots} events_added=${addedEvents} snapshots_total=${snapshots.snapshots.length} events_total=${events.events.length}`);
