import fs from 'node:fs';
import crypto from 'node:crypto';

const DETAILS='data/runtime/source-detail-snapshots.json';
const AREAS='data/runtime/area-evidence-records.json';
const PIPELINE='data/political-information-ingestion-pipeline.json';
const ROUTING_WINDOW_CHARS=3200;

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const sha=s=>crypto.createHash('sha256').update(String(s)).digest('hex');
const compact=s=>String(s??'').replace(/\s+/g,' ').trim();
const uniq=xs=>[...new Set(xs.filter(Boolean))];

const routingRules={
  ELECTORAL:[
    /\b(general election|state election|federal election|territory election|by[- ]?election|election day|polling day)\b/i,
    /\b(candidate|candidacy|nomination|nominations|preference|ballot paper|electoral roll|vote count|count update|declared elected)\b/i
  ],
  LEGISLATIVE:[
    /\b[A-Z][A-Za-z0-9'’()&,\- ]{2,120}\sBill(?:\s20\d{2})?\b/,
    /\b(bill|legislation|second reading|third reading|amendment sheet|committee stage|royal assent)\b/i
  ],
  LEADERSHIP:[
    /\b(leadership challenge|leadership ballot|leadership spill|spill motion|leadership contest|leadership vacancy|challenge for leader|party leader|deputy leadership)\b/i
  ],
  CONFIDENCE_SUPPLY:[
    /\b(no[- ]confidence|motion of confidence|confidence motion|confidence and supply|supply agreement|supply bill|government survival)\b/i
  ],
  BUDGET:[
    /\b(budget|appropriation bill|appropriation|mid[- ]year economic|fiscal package|supply appropriation)\b/i
  ],
  POLICY_ENACTMENT:[
    /\b(implementation|implementing|implemented|commencement|commence|regulation|regulations|ministerial direction|administrative decision|enforcement regime|rollout|roll[- ]out)\b/i
  ],
  PARLIAMENTARY_PROCEDURE:[
    /\b(disallowance|motion to disallow|standing orders|suspension of standing orders|censure motion|referral to committee|refer to committee|procedural motion|closure motion|guillotine|notice of motion|negatived on division|carried on division|resolved on division|division result|division was called|division was required)\b/i
  ],
  PUBLIC_PRESSURE:[
    /\b(petition|open letter|protest|rally|community campaign|grassroots campaign|public campaign|citizen campaign|resident campaign|community submission|public submission)\b/i,
    /\b(call(?:s|ed|ing)? on|demand(?:s|ed|ing)?|urge(?:s|d|ing)?|petition(?:s|ed|ing)? for|campaign(?:s|ed|ing)? for|seek(?:s|ing)? a reversal|seek(?:s|ing)? action)\b/i
  ]
};

const factRules={
  resistance_terms:[/\b(oppose|opposed|opposition|resist|resistance|block|blocked|reject|rejected|defeat|defeated|amend|amendment|challenge|crossbench|dissent|objection|objected)\b/ig],
  stage_terms:[/\b(first reading|second reading|third reading|committee stage|consideration in detail|negatived on division|carried on division|resolved on division|division result|vote|ballot|consultation|public exhibition|commencement|implementation|introduced|before the house|before the senate|before parliament)\b/ig],
  outcome_terms:[/\b(passed|carried|defeated|rejected|withdrawn|lapsed|implemented|blocked|abandoned|retained|replaced|elected|concession|reversal|policy changed)\b/ig],
  pressure_terms:[/\b(petition|protest|rally|campaign|community submission|public submission|open letter|resident|citizen|community group)\b/ig]
};

function hits(text,rules){
  const out=[];
  for(const re of rules){
    re.lastIndex=0;
    const match=re.exec(text);
    if(match) out.push(compact(match[0]));
  }
  return uniq(out);
}

function route(text){
  const result=[];
  for(const [area,rules] of Object.entries(routingRules)){
    const matched=hits(text,rules);
    if(area==='PUBLIC_PRESSURE'){
      if(matched.length<2) continue;
    }else if(!matched.length) continue;
    result.push({competition_class:area,routing_hits:matched});
  }
  return result;
}

function extractFacts(text){
  const out={};
  for(const [key,rules] of Object.entries(factRules)) out[key]=hits(text,rules);
  return out;
}

const details=read(DETAILS);
const ledger=read(AREAS);
const pipeline=read(PIPELINE);
ledger.records ||= [];
const validAreas=new Set((pipeline.areas||[]).map(x=>x.competition_class));
const existingById=new Map(ledger.records.map(x=>[x.area_evidence_id,x]));
let added=0,retracted=0;
const routedAt=new Date().toISOString();

for(const detail of details.records||[]){
  const bodyWindow=String(detail.body_text||'').slice(0,ROUTING_WINDOW_CHARS);
  const text=compact(`${detail.resolved_title||detail.record_title||''} ${bodyWindow}`);
  if(!text) continue;
  const routedRows=route(text).filter(x=>validAreas.has(x.competition_class));
  const activeClasses=new Set(routedRows.map(x=>x.competition_class));

  for(const existing of ledger.records.filter(x=>x.detail_version_id===detail.detail_version_id&&x.routing_state==='SUBSTANTIVE_CONTENT_ROUTED')){
    if(activeClasses.has(existing.competition_class)) continue;
    existing.routing_state='RETRACTED_ROUTING_NOISE';
    existing.retracted_at=routedAt;
    existing.retraction_reason=`Competition-class cue was outside the bounded ${ROUTING_WINDOW_CHARS}-character substantive routing window or no longer satisfied routing rules.`;
    existing.routing_history=Array.isArray(existing.routing_history)?existing.routing_history:[];
    existing.routing_history.push({from:'SUBSTANTIVE_CONTENT_ROUTED',to:'RETRACTED_ROUTING_NOISE',at:routedAt,reason:'ROUTING_NOISE_CORRECTION'});
    retracted++;
  }

  for(const routed of routedRows){
    const id=`AREA-${sha(`${detail.detail_version_id}|${routed.competition_class}`).slice(0,24)}`;
    const prior=existingById.get(id);
    if(prior){
      if(prior.routing_state==='RETRACTED_ROUTING_NOISE'){
        prior.routing_state='SUBSTANTIVE_CONTENT_ROUTED';
        prior.retracted_at=null;
        prior.retraction_reason=null;
        prior.routing_hits=routed.routing_hits;
        prior.routing_history=Array.isArray(prior.routing_history)?prior.routing_history:[];
        prior.routing_history.push({from:'RETRACTED_ROUTING_NOISE',to:'SUBSTANTIVE_CONTENT_ROUTED',at:routedAt,reason:'ROUTING_RULE_MATCH_RESTORED'});
      }
      continue;
    }
    const facts=extractFacts(text);
    const row={
      area_evidence_id:id,
      competition_class:routed.competition_class,
      jurisdiction_id:detail.jurisdiction_id,
      party_id:detail.party_id??null,
      source_id:detail.source_id,
      source_class:detail.source_class,
      detail_record_id:detail.detail_record_id,
      detail_version_id:detail.detail_version_id,
      source_snapshot_id:detail.source_snapshot_id,
      review_id:detail.review_id,
      signal_event_id:detail.signal_event_id,
      record_title:detail.resolved_title||detail.record_title,
      record_url:detail.record_url,
      evidence_captured_at:detail.captured_at,
      routed_at:routedAt,
      routing_state:'SUBSTANTIVE_CONTENT_ROUTED',
      routing_window_chars:ROUTING_WINDOW_CHARS,
      routing_hits:routed.routing_hits,
      extracted_cues:facts,
      substantive_excerpt:String(detail.body_text||'').slice(0,2400),
      actor_ids:[],
      party_ids:detail.party_id?[detail.party_id]:[],
      institution_ids:[],
      public_actor_ids:[],
      position_state:'UNRESOLVED',
      resistance_state:facts.resistance_terms.length?'RESISTANCE_LANGUAGE_PRESENT':'UNRESOLVED',
      outcome_state:facts.outcome_terms.length?'OUTCOME_LANGUAGE_PRESENT':'UNRESOLVED',
      inference:null,
      inference_class:'NONE',
      routing_history:[{from:null,to:'SUBSTANTIVE_CONTENT_ROUTED',at:routedAt,reason:'BOUNDED_SUBSTANTIVE_CONTENT_ROUTING'}],
      integrity:{routing_does_not_register_match:true,entity_mentions_not_yet_resolved:true,positions_not_inferred_from_routing:true}
    };
    ledger.records.push(row);
    existingById.set(id,row);
    added++;
  }
}

const active=ledger.records.filter(x=>x.routing_state==='SUBSTANTIVE_CONTENT_ROUTED');
ledger.updated_at=routedAt;
ledger.summary={
  substantive_detail_records:(details.records||[]).length,
  area_evidence_records_total:ledger.records.length,
  active_area_evidence_records:active.length,
  added_this_run:added,
  retracted_this_run:retracted,
  by_area:Object.fromEntries([...validAreas].map(area=>[area,active.filter(x=>x.competition_class===area).length]))
};
write(AREAS,ledger);
console.log('POLITICAL_MAYHEM_AREA_ROUTING_OK',`details=${details.records?.length||0}`,`active=${active.length}`,`added=${added}`,`retracted=${retracted}`);
