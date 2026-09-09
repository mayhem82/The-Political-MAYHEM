import fs from 'node:fs';
import crypto from 'node:crypto';

const DETAILS='data/runtime/source-detail-snapshots.json';
const AREAS='data/runtime/area-evidence-records.json';
const PIPELINE='data/political-information-ingestion-pipeline.json';

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
    /\b(disallowance|motion to disallow|standing orders|suspension of standing orders|censure motion|referral to committee|refer to committee|procedural motion|closure motion|guillotine|division|notice of motion)\b/i
  ],
  PUBLIC_PRESSURE:[
    /\b(petition|open letter|protest|rally|community campaign|grassroots campaign|public campaign|citizen campaign|resident campaign|community submission|public submission)\b/i,
    /\b(call(?:s|ed|ing)? on|demand(?:s|ed|ing)?|urge(?:s|d|ing)?|petition(?:s|ed|ing)? for|campaign(?:s|ed|ing)? for|seek(?:s|ing)? a reversal|seek(?:s|ing)? action)\b/i
  ]
};

const factRules={
  resistance_terms:[/\b(oppose|opposed|opposition|resist|resistance|block|blocked|reject|rejected|defeat|defeated|amend|amendment|challenge|crossbench|dissent|objection|objected)\b/ig],
  stage_terms:[/\b(first reading|second reading|third reading|committee stage|consideration in detail|division|vote|ballot|consultation|public exhibition|commencement|implementation|introduced|before the house|before the senate|before parliament)\b/ig],
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
const existing=new Set(ledger.records.map(x=>x.area_evidence_id));
let added=0;
const routedAt=new Date().toISOString();

for(const detail of details.records||[]){
  const text=compact(`${detail.resolved_title||detail.record_title||''} ${detail.body_text||''}`);
  if(!text) continue;
  for(const routed of route(text)){
    if(!validAreas.has(routed.competition_class)) continue;
    const id=`AREA-${sha(`${detail.detail_version_id}|${routed.competition_class}`).slice(0,24)}`;
    if(existing.has(id)) continue;
    const facts=extractFacts(text);
    ledger.records.push({
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
      integrity:{routing_does_not_register_match:true,entity_mentions_not_yet_resolved:true,positions_not_inferred_from_routing:true}
    });
    existing.add(id);
    added++;
  }
}

ledger.updated_at=routedAt;
ledger.summary={
  substantive_detail_records:(details.records||[]).length,
  area_evidence_records:ledger.records.length,
  added_this_run:added,
  by_area:Object.fromEntries([...validAreas].map(area=>[area,ledger.records.filter(x=>x.competition_class===area).length]))
};
write(AREAS,ledger);
console.log('POLITICAL_MAYHEM_AREA_ROUTING_OK',`details=${details.records?.length||0}`,`area_records=${ledger.records.length}`,`added=${added}`);
