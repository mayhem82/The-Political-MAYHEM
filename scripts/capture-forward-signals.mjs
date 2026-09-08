import fs from 'node:fs';
import crypto from 'node:crypto';

const REGISTRY='data/forward-signal-source-registry.json';
const STATE='data/runtime/forward-signal-capture-state.json';
const SNAPSHOTS='data/runtime/source-snapshots.json';
const EVENTS='data/runtime/intelligence-events.json';
const MANIFEST='data/runtime/forward-ingestion-manifest.json';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const sha=s=>crypto.createHash('sha256').update(String(s)).digest('hex');
const iso=()=>new Date().toISOString();
const localDate=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Sydney',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const compact=d=>d.toISOString().replace(/[-:.TZ]/g,'').slice(0,14);
const decode=s=>String(s)
  .replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"')
  .replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>');
function normaliseHtml(html){
  return decode(String(html)
    .replace(/<!--[\s\S]*?-->/g,' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi,' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi,' ')
    .replace(/<[^>]+>/g,' '))
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|AEST|AEDT)?\b/gi,'<TIME>')
    .replace(/\s+/g,' ').trim();
}
async function fetchText(url){
  const r=await fetch(url,{headers:{'user-agent':'Political-MAYHEM-Forward-Signal-Capture/1.0 (+https://github.com/mayhem82/The-Political-MAYHEM)','accept':'text/html,text/plain,*/*'}});
  if(!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return await r.text();
}

const registry=read(REGISTRY);
const state=read(STATE);
const snapshotRegister=read(SNAPSHOTS);
const eventLedger=read(EVENTS);
const manifest=read(MANIFEST);
state.sources ||= {};
snapshotRegister.snapshots ||= [];
eventLedger.events ||= [];

let dirty=false;
let baselineCount=0;
let signalCount=0;
const failures=[];
const nowDate=new Date();
const now=nowDate.toISOString();
const dateLocal=localDate(nowDate);

for(const source of (registry.sources||[]).filter(x=>x.active)){
  try{
    const html=await fetchText(source.url);
    const representation=normaliseHtml(html);
    if(!representation) throw new Error('empty normalised representation');
    const contentHash=sha(representation);
    const previous=state.sources[source.watch_id]||null;
    if(previous?.content_hash===contentHash) continue;

    const snapshotId=`AUTO-${source.watch_id}-${compact(nowDate)}`;
    if(!snapshotRegister.snapshots.some(x=>x.snapshot_id===snapshotId)){
      snapshotRegister.snapshots.push({
        snapshot_id:snapshotId,
        contest_id:null,
        cycle_id:null,
        source_id:source.source_id,
        source_registry_snapshot:registry.registry_id,
        source_url:source.url,
        source_name:source.name,
        source_class:source.source_class,
        original_source_class:null,
        published_at:null,
        published_date:null,
        captured_at:now,
        content_hash:contentHash,
        previous_snapshot_id:previous?.snapshot_id||null,
        public_access:'OPEN',
        captured_representation:representation.slice(0,1200),
        notes:previous?'Automated forward capture after source representation changed. Hash covers the normalised captured representation.':'Automated forward baseline capture. No signal event is created for the first observed representation.'
      });
    }

    if(previous){
      const eventId=`SIG-${source.watch_id}-${compact(nowDate)}`;
      if(!eventLedger.events.some(x=>x.event_id===eventId)){
        eventLedger.events.push({
          event_id:eventId,
          jurisdiction_id:source.jurisdiction_id,
          party_id:source.party_id??null,
          actor_id:null,
          source_snapshot_id:snapshotId,
          captured_at:now,
          event_date:dateLocal,
          checkpoint:'CONTINUOUS_FORWARD_SIGNAL_CAPTURE',
          event_type:'SIGNAL_CREATED',
          evidence_state:'SIGNAL',
          signal_state:'POSSIBLE_SIGNAL',
          source_class:source.source_class,
          source_id:source.source_id,
          before:{content_hash:previous.content_hash},
          after:{content_hash:contentHash},
          claim:'Monitored official source changed from its previous forward-captured representation. Semantic classification is pending; this event records only the observed source change.',
          inference:null,
          inference_class:'NONE',
          projection_effect:'NO_EFFECT',
          frozen:false
        });
        signalCount++;
      }
    }else baselineCount++;

    state.sources[source.watch_id]={
      source_id:source.source_id,
      jurisdiction_id:source.jurisdiction_id,
      party_id:source.party_id??null,
      content_hash:contentHash,
      snapshot_id:snapshotId,
      captured_at:now
    };
    dirty=true;
  }catch(err){
    failures.push({watch_id:source.watch_id,error:String(err?.message||err)});
    console.warn(`FORWARD_SIGNAL_SOURCE_FAILED ${source.watch_id}: ${err?.message||err}`);
  }
}

if(dirty){
  state.status='ACTIVE';
  state.updated_at=now;
  state.last_run={captured_at:now,baselines_created:baselineCount,signals_created:signalCount,failures};
  snapshotRegister.scope='Australia — multi-jurisdiction';
  snapshotRegister.captured_at=now;
  eventLedger.captured_at=now;
  manifest.updated_at=now;
  manifest.live_evidence_ingestion ||= {};
  manifest.live_evidence_ingestion.running=true;
  manifest.live_evidence_ingestion.source_snapshots_ingested=snapshotRegister.snapshots.length;
  manifest.live_evidence_ingestion.intelligence_events_ingested=eventLedger.events.length;
  manifest.live_evidence_ingestion.signals_ingested=eventLedger.events.filter(x=>x.event_type==='SIGNAL_CREATED').length;
  manifest.live_evidence_ingestion.last_capture_at=now;
  manifest.status='LIVE_INGESTION_ACTIVE_FORWARD_SIGNAL_CAPTURE_RUNNING';
  write(STATE,state);
  write(SNAPSHOTS,snapshotRegister);
  write(EVENTS,eventLedger);
  write(MANIFEST,manifest);
}

console.log(`FORWARD_SIGNAL_CAPTURE_OK dirty=${dirty} baselines=${baselineCount} signals=${signalCount} failures=${failures.length}`);
