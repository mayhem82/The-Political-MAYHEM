import fs from 'node:fs';
import crypto from 'node:crypto';

const REGISTRY='data/forward-signal-source-registry.json';
const EVENTS='data/runtime/intelligence-events.json';
const REVIEWS='data/runtime/signal-reviews.json';
const DETAILS='data/runtime/source-detail-snapshots.json';
const MAX_BATCH=24;
const FETCH_TIMEOUT_MS=15000;
const MAX_BODY_CHARS=60000;
const RETRY_COOLDOWN_MS=6*60*60*1000;

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

function priority(title=''){
  const t=String(title).toLowerCase();
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
  return score;
}

const headerProfiles=[
  {id:'IDENTIFIED_AUTOMATION',headers:{'user-agent':'Political-MAYHEM-Information-Ingestion/1.0 (+https://github.com/mayhem82/The-Political-MAYHEM)','accept':'text/html,application/xhtml+xml,text/plain,application/pdf,*/*','accept-language':'en-AU,en;q=0.9'}},
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

const queue=[];
for(const review of reviews.reviews||[]){
  if(review.decision!=='PROMOTED_TO_SIGNAL') continue;
  const change=eventById.get(review.source_change_event_id);
  const signal=review.signal_event_id?eventById.get(review.signal_event_id):null;
  const sourceId=change?.source_id||signal?.source_id||null;
  const source=sourceById.get(sourceId)||null;
  for(const record of review.structured_evidence?.added_records||[]){
    if(!record?.url) continue;
    const detailRecordId=`DETAIL-${sha(`${sourceId||'UNKNOWN'}|${record.record_id||''}|${record.url}`).slice(0,24)}`;
    if(completed.has(detailRecordId)) continue;
    const prior=latestAttempt.get(detailRecordId);
    if(prior?.state==='FAILED'&&Date.now()-Date.parse(prior.attempted_at)<RETRY_COOLDOWN_MS) continue;
    queue.push({
      detail_record_id:detailRecordId,
      source_id:sourceId,
      watch_id:source?.watch_id||null,
      jurisdiction_id:change?.jurisdiction_id||signal?.jurisdiction_id||source?.jurisdiction_id||null,
      party_id:change?.party_id??signal?.party_id??source?.party_id??null,
      source_class:change?.source_class||signal?.source_class||source?.source_class||null,
      source_change_event_id:review.source_change_event_id,
      review_id:review.review_id,
      signal_event_id:review.signal_event_id||null,
      source_snapshot_id:change?.source_snapshot_id||signal?.source_snapshot_id||null,
      record_id:record.record_id||null,
      record_title:compact(record.title),
      record_url:record.url,
      record_published:record.published||null,
      priority:priority(record.title)
    });
  }
}

queue.sort((a,b)=>b.priority-a.priority||a.record_url.localeCompare(b.record_url));
const batch=queue.slice(0,MAX_BATCH);
let success=0,failed=0;
const now=new Date().toISOString();
for(const item of batch){
  const attemptedAt=new Date().toISOString();
  try{
    const acquired=await fetchRecord(item.record_url);
    const raw=acquired.text;
    const normalised=/text\/plain/i.test(acquired.content_type)?compact(raw):normaliseHtml(raw);
    if(!normalised||normalised.length<40) throw new Error(`INSUFFICIENT_SUBSTANTIVE_TEXT length=${normalised.length}`);
    const bounded=normalised.slice(0,MAX_BODY_CHARS);
    const detailVersionId=`${item.detail_record_id}-V1`;
    ledger.records.push({
      detail_version_id:detailVersionId,
      detail_record_id:item.detail_record_id,
      version:1,
      source_id:item.source_id,
      watch_id:item.watch_id,
      jurisdiction_id:item.jurisdiction_id,
      party_id:item.party_id,
      source_class:item.source_class,
      source_change_event_id:item.source_change_event_id,
      review_id:item.review_id,
      signal_event_id:item.signal_event_id,
      source_snapshot_id:item.source_snapshot_id,
      record_id:item.record_id,
      record_title:item.record_title,
      resolved_title:titleFromHtml(raw,item.record_title),
      record_url:item.record_url,
      acquisition_url:acquired.url,
      acquisition_content_type:acquired.content_type,
      acquisition_header_profile:acquired.header_profile,
      published_at:item.record_published,
      captured_at:attemptedAt,
      content_hash:sha(normalised),
      body_text:bounded,
      body_length:normalised.length,
      body_complete:normalised.length<=MAX_BODY_CHARS,
      truncation_reason:normalised.length>MAX_BODY_CHARS?`BOUNDED_AT_${MAX_BODY_CHARS}_CHARACTERS`:null,
      evidence_state:'CAPTURED_SUBSTANTIVE_RECORD',
      inference:null,
      inference_class:'NONE'
    });
    ledger.attempts.push({detail_record_id:item.detail_record_id,attempted_at:attemptedAt,state:'SUCCESS',error:null});
    completed.add(item.detail_record_id);
    success++;
  }catch(err){
    ledger.attempts.push({detail_record_id:item.detail_record_id,attempted_at:attemptedAt,state:'FAILED',error:String(err?.message||err),record_url:item.record_url,record_title:item.record_title,source_id:item.source_id,jurisdiction_id:item.jurisdiction_id});
    failed++;
  }
}

ledger.updated_at=now;
ledger.queue_state={
  discovered_detail_records:completed.size+queue.length,
  queued_before_batch:queue.length,
  attempted_this_run:batch.length,
  successful_this_run:success,
  failed_this_run:failed,
  remaining_after_batch:Math.max(0,queue.length-batch.length)
};
write(DETAILS,ledger);
console.log('POLITICAL_MAYHEM_DETAIL_INGEST_OK',`queued=${queue.length}`,`attempted=${batch.length}`,`success=${success}`,`failed=${failed}`,`records=${ledger.records.length}`);
