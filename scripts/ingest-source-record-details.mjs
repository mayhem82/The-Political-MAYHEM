import fs from 'node:fs';
import crypto from 'node:crypto';

const REGISTRY='data/forward-signal-source-registry.json';
const EVENTS='data/runtime/intelligence-events.json';
const REVIEWS='data/runtime/signal-reviews.json';
const DETAILS='data/runtime/source-detail-snapshots.json';
const CURRENT_BATCH=20;
const RETROSPECTIVE_BATCH=4;
const FETCH_TIMEOUT_MS=15000;
const MAX_BODY_CHARS=60000;
const RETRY_COOLDOWN_MS=6*60*60*1000;
const CURRENT_YEAR=new Date().getUTCFullYear();

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const sha=s=>crypto.createHash('sha256').update(String(s)).digest('hex');
const compact=s=>String(s??'').replace(/\s+/g,' ').trim();
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
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi,' ')
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi,' ')
    .replace(/<[^>]+>/g,' '))
    .replace(/\s+/g,' ').trim();
}

function titleFromHtml(html,fallback){
  const h1=String(html).match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if(h1){const value=strip(h1[1]);if(value) return value;}
  const title=String(html).match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if(title){const value=strip(title[1]);if(value) return value;}
  return compact(fallback);
}

function canonicalRecordUrl(value){
  try{
    const u=new URL(value);
    if(u.hostname==='search.parliament.nsw.gov.au'&&u.pathname==='/s/redirect'){
      const embedded=u.searchParams.get('url');
      if(embedded){const direct=new URL(embedded);direct.hash='';return direct.toString();}
    }
    u.hash='';return u.toString();
  }catch{return value;}
}

function temporalLane(title='',url='',published=null){
  const raw=`${title} ${url} ${published||''}`;
  const years=[...raw.matchAll(/\b(20\d{2})\b/g)].map(m=>Number(m[1]));
  if(years.includes(CURRENT_YEAR)) return 'CURRENT';
  if(years.length&&Math.max(...years)<CURRENT_YEAR) return 'RETROSPECTIVE';
  if(published&&Number.isFinite(Date.parse(published))){
    const year=new Date(published).getUTCFullYear();
    if(year===CURRENT_YEAR) return 'CURRENT';
    if(year<CURRENT_YEAR) return 'RETROSPECTIVE';
  }
  return 'CURRENT_OR_UNDATED';
}

function priority(title='',url='',published=null){
  const raw=`${title} ${url}`;
  const t=raw.toLowerCase();
  let score=0;
  const rules=[
    [/\b(no[- ]confidence|confidence|supply)\b/,100],
    [/\b(disallowance|standing orders|censure|referral|division|motion)\b/,95],
    [/\b(bill|legislation|amendment|second reading|committee)\b/,90],
    [/\b(budget|appropriation|fiscal)\b/,85],
    [/\b(leadership|leader|spill|ballot|challenge)\b/,80],
    [/\b(election|by-election|candidate|nomination|preference|count)\b/,75],
    [/\b(petition|protest|campaign|community|open letter|public demand|submission)\b/,70],
    [/\b(implement|implementation|commence|regulation|direction|decision)\b/,60]
  ];
  for(const [re,value] of rules) if(re.test(t)) score=Math.max(score,value);
  const lane=temporalLane(title,url,published);
  if(lane==='CURRENT') score+=60;
  if(lane==='RETROSPECTIVE') score-=60;
  if(/\b(second reading|debate adjourned|before the house|before the senate|introduced|current|scheduled|notice of motion)\b/i.test(raw)) score+=20;
  if(/\b(assented|withdrawn|negatived|lapsed|defeated)\b/i.test(raw)&&lane==='RETROSPECTIVE') score-=30;
  return score;
}

const headerProfiles=[
  {id:'IDENTIFIED_AUTOMATION',headers:{'user-agent':'Political-MAYHEM-Information-Ingestion/1.2 (+https://github.com/mayhem82/The-Political-MAYHEM)','accept':'text/html,application/xhtml+xml,text/plain,application/pdf,*/*','accept-language':'en-AU,en;q=0.9'}},
  {id:'BROWSER_COMPATIBILITY',headers:{'user-agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36','accept':'text/html,application/xhtml+xml,text/plain,application/pdf,*/*;q=0.5','accept-language':'en-AU,en;q=0.9','cache-control':'no-cache','pragma':'no-cache'}}
];

async function fetchRecord(url){
  const errors=[];
  for(const profile of headerProfiles){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),FETCH_TIMEOUT_MS);
    try{
      const response=await fetch(url,{headers:profile.headers,redirect:'follow',signal:controller.signal});
      if(!response.ok){errors.push(`${profile.id}: ${response.status} ${response.statusText}`);continue;}
      const contentType=response.headers.get('content-type')||'';
      if(/application\/pdf|application\/octet-stream/i.test(contentType)) throw new Error(`BINARY_DETAIL_REQUIRES_PDF_EXTRACTION content_type=${contentType}`);
      const text=await response.text();
      if(!String(text).trim()) throw new Error('EMPTY_DETAIL_RESPONSE');
      return {text,url:response.url||url,content_type:contentType,header_profile:profile.id};
    }catch(err){
      const label=err?.name==='AbortError'?`timeout>${FETCH_TIMEOUT_MS}ms`:(err?.message||String(err));
      errors.push(`${profile.id}: ${label}`);
    }finally{clearTimeout(timer);}
  }
  throw new Error(errors.join(' | '));
}

const registry=read(REGISTRY);
const events=read(EVENTS);
const reviews=read(REVIEWS);
const ledger=read(DETAILS);
ledger.records ||= [];
ledger.attempts ||= [];
const sourceById=new Map((registry.sources||[]).map(x=>[x.source_id,x]));
const eventById=new Map((events.events||[]).map(x=>[x.event_id,x]));
const completed=new Set(ledger.records.map(x=>x.detail_record_id));
const latestAttempt=new Map();
for(const attempt of ledger.attempts){
  const prior=latestAttempt.get(attempt.detail_record_id);
  if(!prior||Date.parse(attempt.attempted_at)>Date.parse(prior.attempted_at)) latestAttempt.set(attempt.detail_record_id,attempt);
}

const queueById=new Map();
for(const review of reviews.reviews||[]){
  if(review.decision!=='PROMOTED_TO_SIGNAL') continue;
  const change=eventById.get(review.source_change_event_id);
  const signal=review.signal_event_id?eventById.get(review.signal_event_id):null;
  const sourceId=change?.source_id||signal?.source_id||null;
  const source=sourceById.get(sourceId)||null;
  for(const record of review.structured_evidence?.added_records||[]){
    if(!record?.url) continue;
    const resolvedUrl=canonicalRecordUrl(record.url);
    const detailRecordId=`DETAIL-${sha(`${sourceId||'UNKNOWN'}|${record.record_id||''}|${resolvedUrl}`).slice(0,24)}`;
    if(completed.has(detailRecordId)||queueById.has(detailRecordId)) continue;
    const prior=latestAttempt.get(detailRecordId);
    if(prior?.state==='FAILED'&&Date.now()-Date.parse(prior.attempted_at)<RETRY_COOLDOWN_MS) continue;
    const lane=temporalLane(record.title,resolvedUrl,record.published||null);
    queueById.set(detailRecordId,{
      detail_record_id:detailRecordId,source_id:sourceId,watch_id:source?.watch_id||null,
      jurisdiction_id:change?.jurisdiction_id||signal?.jurisdiction_id||source?.jurisdiction_id||null,
      party_id:change?.party_id??signal?.party_id??source?.party_id??null,
      source_class:change?.source_class||signal?.source_class||source?.source_class||null,
      source_change_event_id:review.source_change_event_id,review_id:review.review_id,signal_event_id:review.signal_event_id||null,
      source_snapshot_id:change?.source_snapshot_id||signal?.source_snapshot_id||null,record_id:record.record_id||null,
      record_title:compact(record.title),original_record_url:record.url,record_url:resolvedUrl,record_published:record.published||null,
      temporal_lane:lane,priority:priority(record.title,resolvedUrl,record.published||null)
    });
  }
}

const queue=[...queueById.values()].sort((a,b)=>b.priority-a.priority||a.record_url.localeCompare(b.record_url));
const currentQueue=queue.filter(x=>x.temporal_lane!=='RETROSPECTIVE');
const retrospectiveQueue=queue.filter(x=>x.temporal_lane==='RETROSPECTIVE');
const batch=[...currentQueue.slice(0,CURRENT_BATCH),...retrospectiveQueue.slice(0,RETROSPECTIVE_BATCH)];
let success=0,failed=0,currentAttempted=0,retrospectiveAttempted=0;
const now=new Date().toISOString();
for(const item of batch){
  const attemptedAt=new Date().toISOString();
  if(item.temporal_lane==='RETROSPECTIVE') retrospectiveAttempted++; else currentAttempted++;
  try{
    const acquired=await fetchRecord(item.record_url);
    const raw=acquired.text;
    const normalised=/text\/plain/i.test(acquired.content_type)?compact(raw):normaliseHtml(raw);
    if(!normalised||normalised.length<40) throw new Error(`INSUFFICIENT_SUBSTANTIVE_TEXT length=${normalised.length}`);
    const bounded=normalised.slice(0,MAX_BODY_CHARS);
    const detailVersionId=`${item.detail_record_id}-V1`;
    ledger.records.push({
      detail_version_id:detailVersionId,detail_record_id:item.detail_record_id,version:1,temporal_lane:item.temporal_lane,
      source_id:item.source_id,watch_id:item.watch_id,jurisdiction_id:item.jurisdiction_id,party_id:item.party_id,source_class:item.source_class,
      source_change_event_id:item.source_change_event_id,review_id:item.review_id,signal_event_id:item.signal_event_id,source_snapshot_id:item.source_snapshot_id,
      record_id:item.record_id,record_title:item.record_title,original_record_url:item.original_record_url,resolved_title:titleFromHtml(raw,item.record_title),record_url:item.record_url,
      acquisition_url:acquired.url,acquisition_content_type:acquired.content_type,acquisition_header_profile:acquired.header_profile,published_at:item.record_published,
      captured_at:attemptedAt,content_hash:sha(normalised),body_text:bounded,body_length:normalised.length,body_complete:normalised.length<=MAX_BODY_CHARS,
      truncation_reason:normalised.length>MAX_BODY_CHARS?`BOUNDED_AT_${MAX_BODY_CHARS}_CHARACTERS`:null,evidence_state:'CAPTURED_SUBSTANTIVE_RECORD',inference:null,inference_class:'NONE'
    });
    ledger.attempts.push({detail_record_id:item.detail_record_id,attempted_at:attemptedAt,state:'SUCCESS',error:null,record_url:item.record_url,temporal_lane:item.temporal_lane});
    completed.add(item.detail_record_id);success++;
  }catch(err){
    ledger.attempts.push({detail_record_id:item.detail_record_id,attempted_at:attemptedAt,state:'FAILED',error:String(err?.message||err),record_url:item.record_url,original_record_url:item.original_record_url,record_title:item.record_title,source_id:item.source_id,jurisdiction_id:item.jurisdiction_id,temporal_lane:item.temporal_lane});
    failed++;
  }
}

ledger.updated_at=now;
ledger.queue_state={
  discovered_detail_records:completed.size+queue.length,queued_before_batch:queue.length,
  current_or_undated_queued:currentQueue.length,retrospective_queued:retrospectiveQueue.length,
  attempted_this_run:batch.length,current_or_undated_attempted:currentAttempted,retrospective_attempted:retrospectiveAttempted,
  successful_this_run:success,failed_this_run:failed,remaining_after_batch:Math.max(0,queue.length-batch.length)
};
write(DETAILS,ledger);
console.log('POLITICAL_MAYHEM_DETAIL_INGEST_OK',`queued=${queue.length}`,`current=${currentQueue.length}`,`retrospective=${retrospectiveQueue.length}`,`attempted=${batch.length}`,`currentAttempted=${currentAttempted}`,`retroAttempted=${retrospectiveAttempted}`,`success=${success}`,`failed=${failed}`,`records=${ledger.records.length}`);
