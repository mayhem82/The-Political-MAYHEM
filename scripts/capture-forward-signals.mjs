import fs from 'node:fs';
import crypto from 'node:crypto';

const REGISTRY='data/forward-signal-source-registry.json';
const STATE='data/runtime/forward-signal-capture-state.json';
const SNAPSHOTS='data/runtime/source-snapshots.json';
const EVENTS='data/runtime/intelligence-events.json';
const MANIFEST='data/runtime/forward-ingestion-manifest.json';
const FETCH_TIMEOUT_MS=15000;
const MAX_PUBLICATION_RECORDS=600;

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const sha=s=>crypto.createHash('sha256').update(String(s)).digest('hex');
const localDate=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Sydney',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const compact=d=>d.toISOString().replace(/[-:.TZ]/g,'').slice(0,14);
const decode=s=>String(s??'')
  .replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"')
  .replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>');
const strip=s=>decode(String(s??'').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();

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

function firstDifference(a,b,window=240){
  const x=String(a??''),y=String(b??'');
  let start=0;
  const min=Math.min(x.length,y.length);
  while(start<min&&x[start]===y[start]) start++;
  let endX=x.length-1,endY=y.length-1;
  while(endX>=start&&endY>=start&&x[endX]===y[endY]){endX--;endY--;}
  const from=Math.max(0,start-Math.floor(window/2));
  return {
    delta_type:'TEXT_REPRESENTATION',
    first_difference_offset:start,
    before_length:x.length,
    after_length:y.length,
    before_excerpt:x.slice(from,Math.min(x.length,endX+1+Math.floor(window/2))),
    after_excerpt:y.slice(from,Math.min(y.length,endY+1+Math.floor(window/2))),
    delta_hash:sha(`${x.slice(start,endX+1)}\n---\n${y.slice(start,endY+1)}`)
  };
}

function safeUrl(href,base){
  try{
    const u=new URL(decode(href).trim(),base);
    if(!['http:','https:'].includes(u.protocol)) return null;
    u.hash='';
    for(const k of [...u.searchParams.keys()]) if(/^utm_|^fbclid$|^gclid$/i.test(k)) u.searchParams.delete(k);
    return u.toString();
  }catch{return null;}
}

const genericLinkText=new Set(['home','read more','more','learn more','view more','next','previous','contact us','privacy','copyright','accessibility','search','menu','subscribe','news','media','media releases','latest news','latest media releases']);
function usefulTitle(s){
  const x=strip(s).replace(/\s+/g,' ').trim();
  if(x.length<8||x.length>240) return null;
  if(genericLinkText.has(x.toLowerCase())) return null;
  return x;
}

function extractHtmlPublicationRecords(html,base){
  const out=[];
  for(const m of String(html).matchAll(/<a\b([^>]*?)href\s*=\s*(["'])(.*?)\2([^>]*)>([\s\S]*?)<\/a>/gi)){
    const title=usefulTitle(m[5]);
    const url=safeUrl(m[3],base);
    if(!title||!url) continue;
    const u=new URL(url);
    const baseHost=new URL(base).hostname.replace(/^www\./,'');
    const host=u.hostname.replace(/^www\./,'');
    if(host!==baseHost&&!host.endsWith('.'+baseHost)&&!baseHost.endsWith('.'+host)) continue;
    if(u.pathname==='/'&&u.search==='') continue;
    out.push({record_id:sha(`${url}\n${title}`).slice(0,20),title,url});
  }
  const unique=new Map();
  for(const r of out) if(!unique.has(r.record_id)) unique.set(r.record_id,r);
  return [...unique.values()].sort((a,b)=>a.record_id.localeCompare(b.record_id)).slice(0,MAX_PUBLICATION_RECORDS);
}

function tagValue(block,tag){
  const m=String(block).match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,'i'));
  return m?strip(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1')):null;
}
function extractRssPublicationRecords(text,base){
  const blocks=[...String(text).matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(m=>m[1]);
  if(!blocks.length) return [];
  const out=[];
  for(const block of blocks){
    const title=usefulTitle(tagValue(block,'title'));
    const link=tagValue(block,'link')||tagValue(block,'guid');
    const url=safeUrl(link,base);
    if(!title||!url) continue;
    const published=tagValue(block,'pubDate')||tagValue(block,'dc:date')||null;
    out.push({record_id:sha(`${url}\n${title}`).slice(0,20),title,url,published});
  }
  const unique=new Map();
  for(const r of out) if(!unique.has(r.record_id)) unique.set(r.record_id,r);
  return [...unique.values()].sort((a,b)=>a.record_id.localeCompare(b.record_id)).slice(0,MAX_PUBLICATION_RECORDS);
}

function deriveRepresentation(source,acquisition){
  const mode=source.capture_mode||'NORMALISED_PAGE_HASH';
  if(mode==='PUBLICATION_FEED_HASH'){
    const rss=extractRssPublicationRecords(acquisition.text,acquisition.url);
    const records=rss.length?rss:extractHtmlPublicationRecords(acquisition.text,acquisition.url);
    if(!records.length) throw new Error('publication-feed extractor found no stable records');
    return {capture_mode:mode,representation:JSON.stringify(records),records};
  }
  const representation=normaliseHtml(acquisition.text);
  if(!representation) throw new Error('empty normalised representation');
  return {capture_mode:'NORMALISED_PAGE_HASH',representation,records:null};
}

function recordDelta(beforeRecords,afterRecords){
  const before=new Map((beforeRecords||[]).map(r=>[r.record_id,r]));
  const after=new Map((afterRecords||[]).map(r=>[r.record_id,r]));
  const added=[...after.values()].filter(r=>!before.has(r.record_id));
  const removed=[...before.values()].filter(r=>!after.has(r.record_id));
  return {
    delta_type:'STRUCTURED_RECORD_SET',
    records_added:added,
    records_removed:removed,
    added_count:added.length,
    removed_count:removed.length,
    before_count:before.size,
    after_count:after.size,
    delta_hash:sha(JSON.stringify({added,removed}))
  };
}

const headerProfiles=[
  {id:'IDENTIFIED_AUTOMATION',headers:{'user-agent':'Political-MAYHEM-Forward-Signal-Capture/2.0 (+https://github.com/mayhem82/The-Political-MAYHEM)','accept':'text/html,application/xhtml+xml,application/rss+xml,application/xml,text/plain,*/*','accept-language':'en-AU,en;q=0.9'}},
  {id:'BROWSER_COMPATIBILITY',headers:{'user-agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36','accept':'text/html,application/xhtml+xml,application/rss+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5','accept-language':'en-AU,en;q=0.9','cache-control':'no-cache','pragma':'no-cache','from':'https://github.com/mayhem82/The-Political-MAYHEM'}}
];
async function fetchSource(source){
  const urls=[source.url,...(source.fallback_urls||[])].filter((v,i,a)=>v&&a.indexOf(v)===i);
  const errors=[];
  for(const url of urls){
    for(const profile of headerProfiles){
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),FETCH_TIMEOUT_MS);
      try{
        const r=await fetch(url,{headers:profile.headers,redirect:'follow',signal:controller.signal});
        if(!r.ok){errors.push(`${url} [${profile.id}] ${r.status} ${r.statusText}`);continue;}
        const text=await r.text();
        if(!String(text).trim()){errors.push(`${url} [${profile.id}] empty response`);continue;}
        return {text,url:r.url||url,requested_url:url,header_profile:profile.id,content_type:r.headers.get('content-type')||null};
      }catch(err){
        const label=err?.name==='AbortError'?`timeout>${FETCH_TIMEOUT_MS}ms`:(err?.message||err);
        errors.push(`${url} [${profile.id}] ${label}`);
      }finally{clearTimeout(timer);}
    }
  }
  throw new Error(errors.join(' | '));
}

const registry=read(REGISTRY);
const state=read(STATE);
const snapshotRegister=read(SNAPSHOTS);
const eventLedger=read(EVENTS);
const manifest=read(MANIFEST);
state.sources ||= {};
snapshotRegister.snapshots ||= [];
eventLedger.events ||= [];
const snapshotById=new Map(snapshotRegister.snapshots.map(x=>[x.snapshot_id,x]));

let dirty=false;
let baselineCount=0;
let sourceChangeCount=0;
let representationUpgradeCount=0;
const failures=[];
const nowDate=new Date();
const now=nowDate.toISOString();
const dateLocal=localDate(nowDate);

for(const source of (registry.sources||[]).filter(x=>x.active)){
  try{
    const acquisition=await fetchSource(source);
    const derived=deriveRepresentation(source,acquisition);
    const representation=derived.representation;
    const contentHash=sha(representation);
    const previous=state.sources[source.watch_id]||null;
    const previousSnapshot=previous?snapshotById.get(previous.snapshot_id):null;
    const previousMode=previous?.capture_mode||'NORMALISED_PAGE_HASH';
    const modeChanged=Boolean(previous&&previousMode!==derived.capture_mode);
    const sameHash=previous?.content_hash===contentHash;
    const requiresRepresentationUpgrade=Boolean(previous&&!modeChanged&&sameHash&&previousSnapshot?.captured_representation_complete!==true);
    const acquisitionMetadataChanged=Boolean(previous&&!modeChanged&&sameHash&&!requiresRepresentationUpgrade&&(previous.acquisition_url!==acquisition.url||previous.header_profile!==acquisition.header_profile||previous.content_type!==acquisition.content_type));

    if(previous&&!modeChanged&&sameHash&&!requiresRepresentationUpgrade){
      if(acquisitionMetadataChanged){
        state.sources[source.watch_id]={...previous,acquisition_url:acquisition.url,requested_url:acquisition.requested_url,header_profile:acquisition.header_profile,content_type:acquisition.content_type,capture_mode:derived.capture_mode};
        dirty=true;
      }
      continue;
    }

    const contentChanged=Boolean(previous&&!sameHash&&!modeChanged);
    const snapshotId=`AUTO-${source.watch_id}-${compact(nowDate)}`;
    if(!snapshotRegister.snapshots.some(x=>x.snapshot_id===snapshotId)){
      const notes=!previous
        ?'Automated forward baseline capture. No source-change event or political signal is created for the first observed representation.'
        :modeChanged
          ?`Capture-mode baseline migration from ${previousMode} to ${derived.capture_mode}. Representation changed by extraction method, not treated as a political source change.`
          :requiresRepresentationUpgrade
            ?'Evidence-preservation upgrade of an existing unchanged baseline. Full normalized representation retained; content hash unchanged; no political signal created.'
            :'Automated forward capture after source representation changed. Raw source change is preserved separately from semantic signal promotion.';
      const snapshot={
        snapshot_id:snapshotId,
        contest_id:null,
        cycle_id:null,
        source_id:source.source_id,
        source_registry_snapshot:registry.registry_id,
        source_url:source.url,
        acquisition_url:acquisition.url,
        requested_acquisition_url:acquisition.requested_url,
        acquisition_header_profile:acquisition.header_profile,
        acquisition_content_type:acquisition.content_type,
        source_name:source.name,
        source_class:source.source_class,
        original_source_class:null,
        capture_mode:derived.capture_mode,
        published_at:null,
        published_date:null,
        captured_at:now,
        content_hash:contentHash,
        hash_basis:derived.capture_mode==='PUBLICATION_FEED_HASH'?'COMPLETE_STRUCTURED_PUBLICATION_RECORD_SET':'COMPLETE_NORMALISED_CAPTURED_REPRESENTATION',
        previous_snapshot_id:previous?.snapshot_id||null,
        public_access:'OPEN',
        captured_representation:representation,
        captured_representation_complete:true,
        captured_representation_length:representation.length,
        structured_records:derived.records,
        notes
      };
      snapshotRegister.snapshots.push(snapshot);
      snapshotById.set(snapshotId,snapshot);
    }

    if(contentChanged){
      const eventId=`CHG-${source.watch_id}-${compact(nowDate)}`;
      if(!eventLedger.events.some(x=>x.event_id===eventId)){
        const delta=derived.capture_mode==='PUBLICATION_FEED_HASH'
          ?recordDelta(previousSnapshot?.structured_records||[],derived.records||[])
          :firstDifference(previousSnapshot?.captured_representation||'',representation);
        eventLedger.events.push({
          event_id:eventId,
          parent_event_id:null,
          jurisdiction_id:source.jurisdiction_id,
          party_id:source.party_id??null,
          actor_id:null,
          source_snapshot_id:snapshotId,
          captured_at:now,
          event_date:dateLocal,
          checkpoint:'CONTINUOUS_FORWARD_SOURCE_CAPTURE',
          event_type:'SOURCE_CHANGED',
          evidence_state:'VERIFIED',
          signal_state:'OBSERVED',
          semantic_review_state:'PENDING',
          materiality_state:'UNASSESSED',
          source_class:source.source_class,
          source_id:source.source_id,
          capture_mode:derived.capture_mode,
          review_policy:source.review_policy||'REVIEW_UNSTRUCTURED_CHANGE',
          before:{snapshot_id:previous.snapshot_id,content_hash:previous.content_hash,capture_mode:previousMode},
          after:{snapshot_id:snapshotId,content_hash:contentHash,capture_mode:derived.capture_mode},
          representation_delta:delta,
          claim:'Monitored official source changed from its previous forward-captured representation. This is a verified source-change observation only; it is not yet a political signal.',
          observed_behaviour:'The captured representation of the monitored source changed relative to the immediately preceding forward snapshot.',
          inference:null,
          inference_class:'NONE',
          projection_effect:'NO_EFFECT',
          information_advantage:'NONE',
          frozen:false
        });
        sourceChangeCount++;
      }
    }else if(!previous){
      baselineCount++;
    }else if(modeChanged||requiresRepresentationUpgrade){
      representationUpgradeCount++;
    }

    state.sources[source.watch_id]={
      source_id:source.source_id,
      jurisdiction_id:source.jurisdiction_id,
      party_id:source.party_id??null,
      content_hash:contentHash,
      snapshot_id:snapshotId,
      captured_at:now,
      acquisition_url:acquisition.url,
      requested_url:acquisition.requested_url,
      header_profile:acquisition.header_profile,
      content_type:acquisition.content_type,
      capture_mode:derived.capture_mode,
      captured_representation_complete:true
    };
    dirty=true;
  }catch(err){
    failures.push({watch_id:source.watch_id,error:String(err?.message||err)});
    console.warn(`FORWARD_SIGNAL_SOURCE_FAILED ${source.watch_id}: ${err?.message||err}`);
  }
}

const active=(registry.sources||[]).filter(x=>x.active);
const failureSet=new Set(failures.map(x=>x.watch_id));
const jurisdictionIds=['AUS-FED','AUS-NSW','AUS-VIC','AUS-QLD','AUS-WA','AUS-SA','AUS-TAS','AUS-ACT','AUS-NT'];
const jurisdictionCoverage={};
for(const id of jurisdictionIds){
  const configured=active.filter(x=>x.jurisdiction_id===id);
  const baselines=configured.filter(x=>state.sources?.[x.watch_id]);
  const failed=configured.filter(x=>failureSet.has(x.watch_id));
  jurisdictionCoverage[id]={
    configured_sources:configured.length,
    baseline_sources:baselines.length,
    current_run_failures:failed.length,
    source_classes:[...new Set(configured.map(x=>x.source_class))].sort(),
    status:baselines.length===configured.length&&failed.length===0?'CAPTURE_ACTIVE_FULL_CONFIGURED_BASELINE':baselines.length>0&&failed.length===0?'CAPTURE_ACTIVE_PARTIAL_BASELINE':baselines.length>0?'CAPTURE_ACTIVE_DEGRADED_CURRENT_RUN':'CAPTURE_NOT_ESTABLISHED'
  };
}

state.status='ACTIVE';
state.updated_at=now;
state.registry_id=registry.registry_id;
state.coverage={active_sources:active.length,baselines_captured:active.filter(x=>state.sources?.[x.watch_id]).length,current_run_failures:failures.length,jurisdictions:jurisdictionCoverage};
state.last_run={captured_at:now,baselines_created:baselineCount,source_changes_created:sourceChangeCount,semantic_signals_created:0,representation_upgrades:representationUpgradeCount,failures};
manifest.updated_at=now;
manifest.live_evidence_ingestion ||= {};
manifest.live_evidence_ingestion.running=true;
manifest.live_evidence_ingestion.last_capture_at=now;
manifest.live_evidence_ingestion.watched_sources=active.length;
manifest.live_evidence_ingestion.capture_baselines=state.coverage.baselines_captured;
manifest.live_evidence_ingestion.capture_failures_last_run=failures.length;
manifest.live_evidence_ingestion.jurisdiction_capture=jurisdictionCoverage;
const keyMap={'AUS-FED':'federal','AUS-NSW':'new_south_wales','AUS-VIC':'victoria','AUS-QLD':'queensland','AUS-WA':'western_australia','AUS-SA':'south_australia','AUS-TAS':'tasmania','AUS-ACT':'australian_capital_territory','AUS-NT':'northern_territory'};
manifest.live_evidence_ingestion.jurisdiction_coverage ||= {};
for(const [id,key] of Object.entries(keyMap)) manifest.live_evidence_ingestion.jurisdiction_coverage[key]=jurisdictionCoverage[id].status;

snapshotRegister.scope='Australia — multi-jurisdiction';
snapshotRegister.captured_at=now;
eventLedger.captured_at=now;
manifest.live_evidence_ingestion.source_snapshots_ingested=snapshotRegister.snapshots.length;
manifest.live_evidence_ingestion.intelligence_events_ingested=eventLedger.events.length;
manifest.live_evidence_ingestion.source_changes_ingested=eventLedger.events.filter(x=>x.event_type==='SOURCE_CHANGED').length;
manifest.live_evidence_ingestion.signals_ingested=eventLedger.events.filter(x=>x.event_type==='SIGNAL_CREATED').length;
manifest.status='LIVE_INGESTION_ACTIVE_STRUCTURED_FORWARD_SIGNAL_CAPTURE_ALL_NINE_FIELDS';
write(SNAPSHOTS,snapshotRegister);
write(EVENTS,eventLedger);
write(STATE,state);
write(MANIFEST,manifest);
console.log(`FORWARD_SIGNAL_CAPTURE_OK dirty=${dirty} active=${active.length} baselines=${state.coverage.baselines_captured} new_baselines=${baselineCount} source_changes=${sourceChangeCount} semantic_signals=0 representation_upgrades=${representationUpgradeCount} failures=${failures.length}`);
