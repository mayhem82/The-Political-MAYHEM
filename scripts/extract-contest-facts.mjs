import fs from 'node:fs';
import crypto from 'node:crypto';

const AREAS='data/runtime/area-evidence-records.json';
const DETAILS='data/runtime/source-detail-snapshots.json';
const FACTS='data/runtime/contest-facts.json';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const sha=s=>crypto.createHash('sha256').update(String(s)).digest('hex');
const compact=s=>String(s??'').replace(/\s+/g,' ').trim();
const uniq=xs=>[...new Set(xs.filter(Boolean))];
const norm=s=>compact(s).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[’']/g,"'").toLowerCase();

function substantiveWindow(text){
  const raw=compact(text);
  const markers=[' Helpful information ',' Website features ',' Acknowledgement of Country ',' Senate Senate Work of the Senate '];
  let end=raw.length;
  for(const marker of markers){
    const i=raw.indexOf(marker);
    if(i>=0) end=Math.min(end,i);
  }
  return raw.slice(0,end);
}

function excerpt(text,index,length,radius=180){
  const start=Math.max(0,index-radius);
  const end=Math.min(text.length,index+length+radius);
  return compact(text.slice(start,end));
}

function allMatches(text,re,limit=30){
  const flags=re.flags.includes('g')?re.flags:re.flags+'g';
  const rx=new RegExp(re.source,flags);
  const out=[];
  let m;
  while((m=rx.exec(text))&&out.length<limit){
    out.push({match:m[0],index:m.index});
    if(m[0].length===0) rx.lastIndex++;
  }
  return out;
}

const classPatterns={
  ELECTORAL:{
    CONTEST_OBJECT:[/\b(?:federal|state|territory|general|local|by[- ]?) election\b/ig,/\bby-election\b/ig],
    STAGE:[/\b(?:nominations? (?:open|close|closed)|polling day|voting (?:opens|closes)|count(?:ing)? (?:underway|continues|update)|declared elected|declaration of poll)\b[^.;]{0,140}/ig],
    POSSIBLE_OUTCOME_STATE:[/\b(?:declared elected|elected|count completed|result declared)\b[^.;]{0,140}/ig]
  },
  LEGISLATIVE:{
    CONTEST_OBJECT:[/\b[A-Z][A-Za-z0-9'’()&,\- ]{2,140}\sBill(?:\s20\d{2})?\b/g],
    OBJECTIVE:[/\bSummary\s+Amends?\s+.{20,900}?(?=\sProgress\b)/ig,/\bSummary\s+.{20,900}?(?=\sProgress\b)/ig],
    STAGE:[/\b(?:Status\s+(?:Before Reps|Before Senate|Not Proceeding)|Introduced and read a first time|Second reading moved|Second reading debate|Second reading agreed to|Third reading agreed to|Consideration in detail debate|Referred to [A-Z][^.;]{0,120}|Reported from [A-Z][^.;]{0,120}|Removed from the Notice Paper[^.;]{0,120})\b[^.;]{0,80}/ig],
    AMENDMENT:[/\b(?:Amendment details|Proposed amendments|Schedules? of amendments)\b[^.;]{0,220}/ig],
    PROCEDURAL_ACTION:[/\b(?:Referred to [A-Z][^.;]{0,140}|Removed from the Notice Paper[^.;]{0,140}|Reported from [A-Z][^.;]{0,140})/ig],
    VOTE_OR_DIVISION:[/\b(?:agreed to|negatived on division|carried on division|division)\b[^.;]{0,120}/ig],
    MATERIAL_RESISTANCE:[/\b(?:opposed|opposition|negatived on division|rejected|blocked|defeated|voted against|will not support|does not support|unresolved question)\b[^.;]{0,160}/ig],
    POSSIBLE_OUTCOME_STATE:[/\b(?:Status Not Proceeding|Third reading agreed to|Second reading agreed to|withdrawn|lapsed|assented|defeated|negatived on division)\b[^.;]{0,160}/ig]
  },
  LEADERSHIP:{
    CONTEST_OBJECT:[/\b(?:leadership challenge|leadership ballot|leadership contest|leadership vacancy|spill motion|party leader|deputy leadership)\b[^.;]{0,160}/ig],
    STAGE:[/\b(?:nominations? open|nominations? close|ballot|spill motion|vacancy|resignation)\b[^.;]{0,160}/ig],
    MATERIAL_RESISTANCE:[/\b(?:challenge|challenger|spill|opposed|rival|contested ballot)\b[^.;]{0,180}/ig],
    POSSIBLE_OUTCOME_STATE:[/\b(?:elected leader|won the ballot|lost the ballot|resigned as leader|leadership vacancy filled)\b[^.;]{0,180}/ig]
  },
  CONFIDENCE_SUPPLY:{
    CONTEST_OBJECT:[/\b(?:motion of no confidence|no-confidence motion|confidence motion|motion of confidence|confidence and supply|supply agreement|supply bill)\b[^.;]{0,180}/ig],
    STAGE:[/\b(?:notice of motion|moved|debate|division|vote|agreed to|negatived)\b[^.;]{0,160}/ig],
    MATERIAL_RESISTANCE:[/\b(?:no confidence|opposed|will not support|withdraw support|vote against|negatived)\b[^.;]{0,180}/ig],
    VOTE_OR_DIVISION:[/\b(?:division|vote|agreed to|negatived)\b[^.;]{0,140}/ig],
    POSSIBLE_OUTCOME_STATE:[/\b(?:confidence retained|confidence lost|supply passed|supply defeated|agreed to|negatived)\b[^.;]{0,180}/ig]
  },
  BUDGET:{
    CONTEST_OBJECT:[/\b(?:budget|appropriation bill|appropriation|fiscal package|mid-year economic)\b[^.;]{0,180}/ig],
    OBJECTIVE:[/\b(?:budget|appropriation)[^.;]{0,120}\b(?:fund|provide|deliver|allocate|invest|reduce|increase)\b[^.;]{0,220}/ig],
    STAGE:[/\b(?:introduced|second reading|third reading|debate|division|passed|before the house|before the senate)\b[^.;]{0,160}/ig],
    MATERIAL_RESISTANCE:[/\b(?:opposed|reject|rejected|block|blocked|defeat|defeated|will not support|amendment demand)\b[^.;]{0,180}/ig],
    VOTE_OR_DIVISION:[/\b(?:division|vote|passed|defeated|agreed to|negatived)\b[^.;]{0,140}/ig],
    POSSIBLE_OUTCOME_STATE:[/\b(?:passed|defeated|withdrawn|amended|agreed to|negatived)\b[^.;]{0,160}/ig]
  },
  POLICY_ENACTMENT:{
    CONTEST_OBJECT:[/\b(?:policy|program|scheme|reform|framework|regulation|regulatory regime|ministerial direction)\b[^.;]{0,180}/ig],
    OBJECTIVE:[/\b(?:aims? to|seeks? to|intends? to|designed to|will provide|will establish|will introduce)\b[^.;]{0,220}/ig],
    IMPLEMENTATION_ACTION:[/\b(?:implement(?:ed|ation|ing)?|commenc(?:e|ed|ement)|roll[- ]?out|regulation(?:s)?|direction|enforcement regime|comes? into force)\b[^.;]{0,180}/ig],
    STAGE:[/\b(?:draft|consultation|implementation|commencement|roll[- ]?out|in force|finalised|released)\b[^.;]{0,160}/ig],
    MATERIAL_RESISTANCE:[/\b(?:opposed|resisted|blocked|challenged|refused|rejected|stakeholder opposition)\b[^.;]{0,180}/ig],
    POSSIBLE_OUTCOME_STATE:[/\b(?:implemented|commenced|in force|abandoned|reversed|withdrawn|finalised)\b[^.;]{0,180}/ig]
  },
  PARLIAMENTARY_PROCEDURE:{
    CONTEST_OBJECT:[/\b(?:notice of motion|disallowance notice|motion to disallow|censure motion|suspension of standing orders|referral to committee|procedural motion|closure motion|guillotine)\b[^.;]{0,180}/ig],
    PROCEDURAL_ACTION:[/\b(?:moved|referred|disallowed|suspended|censured|adjourned|removed from the Notice Paper|division)\b[^.;]{0,180}/ig],
    STAGE:[/\b(?:notice of motion|debate|division|vote|referred to committee|before the house|before the senate)\b[^.;]{0,160}/ig],
    MATERIAL_RESISTANCE:[/\b(?:opposed|negatived|blocked|rejected|defeated|voted against)\b[^.;]{0,180}/ig],
    VOTE_OR_DIVISION:[/\b(?:division|vote|agreed to|negatived|carried|defeated)\b[^.;]{0,140}/ig],
    POSSIBLE_OUTCOME_STATE:[/\b(?:carried|defeated|negatived|agreed to|disallowed|withdrawn|referred)\b[^.;]{0,160}/ig]
  },
  PUBLIC_PRESSURE:{
    CONTEST_OBJECT:[/\b(?:petition|open letter|community campaign|public campaign|resident campaign|protest|rally)\b[^.;]{0,180}/ig],
    PUBLIC_DEMAND:[/\b(?:call(?:s|ed|ing)? on|demand(?:s|ed|ing)?|urge(?:s|d|ing)?|petition(?:s|ed|ing)? for|campaign(?:s|ed|ing)? for)\b[^.;]{0,240}/ig],
    PRESSURE_ACTION:[/\b(?:petition|protest|rally|open letter|community campaign|public campaign|submission)\b[^.;]{0,180}/ig],
    INSTITUTIONAL_RESPONSE:[/\b(?:government|minister|department|agency|authority|council|parliament)\b[^.;]{0,120}\b(?:agreed|refused|rejected|reversed|changed|conceded|responded|announced|committed)\b[^.;]{0,180}/ig],
    MATERIAL_RESISTANCE:[/\b(?:refused|rejected|resisted|delayed|inaction|declined|would not)\b[^.;]{0,180}/ig],
    POSSIBLE_OUTCOME_STATE:[/\b(?:concession|reversal|policy changed|agreed to|committed to|withdrawn|cancelled)\b[^.;]{0,180}/ig]
  }
};

const explicitSupport=/\b(?:supports?|supported|backs?|backed|endorses?|endorsed|in favour of|voted? for|will support)\b[^.;]{0,160}/ig;
const explicitOpposition=/\b(?:opposes?|opposed|against|voted? against|will not support|does not support|rejects?|rejected)\b[^.;]{0,160}/ig;

function entityIdsForEvidence(row,evidenceText){
  const n=norm(evidenceText);
  const actorIds=[];
  for(const actor of row.entity_mentions?.actors||[]){
    const candidates=[norm(actor.name),norm(actor.match_variant)].filter(Boolean);
    if(candidates.some(x=>n.includes(x))) actorIds.push(actor.actor_id);
  }
  const partyIds=[];
  for(const team of row.entity_mentions?.teams||[]){
    const candidates=[norm(team.name),norm(team.match_alias)].filter(Boolean);
    if(candidates.some(x=>n.includes(x))) partyIds.push(team.party_id);
  }
  return {actor_ids:uniq(actorIds),party_ids:uniq(partyIds)};
}

const areas=read(AREAS);
const details=read(DETAILS);
const ledger=read(FACTS);
ledger.facts ||= [];
const allowedTypes=new Set(ledger.fact_types||[]);
const detailByVersion=new Map((details.records||[]).map(x=>[x.detail_version_id,x]));
const existing=new Set(ledger.facts.map(x=>x.fact_id));
const now=new Date().toISOString();
let added=0,examined=0;

function addFact(row,detail,factType,match,index,text){
  if(!allowedTypes.has(factType)) return;
  const evidence=excerpt(text,index,match.length);
  if(!evidence) return;
  const entities=entityIdsForEvidence(row,evidence);
  const factId=`FACT-${sha(`${row.area_evidence_id}|${factType}|${compact(match)}|${evidence}`).slice(0,24)}`;
  if(existing.has(factId)) return;
  const explicitPosition=['EXPLICIT_SUPPORT_POSITION','EXPLICIT_OPPOSITION_POSITION'].includes(factType);
  if(explicitPosition&&entities.actor_ids.length===0&&entities.party_ids.length===0) return;
  ledger.facts.push({
    fact_id:factId,
    competition_class:row.competition_class,
    jurisdiction_id:row.jurisdiction_id,
    area_evidence_id:row.area_evidence_id,
    detail_record_id:row.detail_record_id,
    detail_version_id:row.detail_version_id,
    source_snapshot_id:row.source_snapshot_id,
    source_id:row.source_id,
    source_class:row.source_class,
    record_url:row.record_url,
    record_title:row.record_title,
    fact_type:factType,
    fact_state:'OBSERVED_SOURCE_TEXT',
    evidence_match:compact(match),
    evidence_text:evidence,
    evidence_captured_at:row.evidence_captured_at,
    extracted_at:now,
    actor_ids:entities.actor_ids,
    party_ids:entities.party_ids,
    position_state:factType==='EXPLICIT_SUPPORT_POSITION'?'SUPPORTING':factType==='EXPLICIT_OPPOSITION_POSITION'?'OPPOSING':'UNRESOLVED',
    resistance_state:factType==='MATERIAL_RESISTANCE'?'EXPLICIT_RESISTANCE_LANGUAGE':'UNRESOLVED',
    outcome_verification_state:factType==='POSSIBLE_OUTCOME_STATE'?'REQUIRES_SEPARATE_VERIFICATION':'NOT_APPLICABLE',
    inference:null,
    inference_class:'NONE',
    projection_effect:'NO_EFFECT',
    integrity:{source_text_preserved:true,area_lineage_preserved:true,entity_identity_limited_to_resolved_mentions:true,position_requires_explicit_language:true,competition_not_registered_by_fact:true}
  });
  existing.add(factId);added++;
}

for(const row of areas.records||[]){
  if(row.routing_state!=='SUBSTANTIVE_CONTENT_ROUTED') continue;
  examined++;
  const detail=detailByVersion.get(row.detail_version_id);
  if(!detail) continue;
  const text=substantiveWindow(detail.body_text||'');
  if(!text) continue;
  const patterns=classPatterns[row.competition_class]||{};
  for(const [factType,list] of Object.entries(patterns)){
    for(const re of list){
      for(const hit of allMatches(text,re)) addFact(row,detail,factType,hit.match,hit.index,text);
    }
  }
  for(const hit of allMatches(text,explicitSupport)) addFact(row,detail,'EXPLICIT_SUPPORT_POSITION',hit.match,hit.index,text);
  for(const hit of allMatches(text,explicitOpposition)) addFact(row,detail,'EXPLICIT_OPPOSITION_POSITION',hit.match,hit.index,text);
  for(const actor of row.entity_mentions?.actors||[]){
    const candidates=[actor.match_variant,actor.name].map(norm).filter(Boolean);
    const normalized=norm(text);
    const matched=candidates.find(x=>normalized.includes(x));
    if(!matched) continue;
    const rawNeedle=String(actor.name||'').trim();
    let index=rawNeedle?text.toLowerCase().indexOf(rawNeedle.toLowerCase()):-1;
    if(index<0){
      const parts=matched.split(' ');
      const surname=parts[0]||'';
      index=surname?text.toLowerCase().indexOf(surname):-1;
    }
    if(index>=0) addFact(row,detail,'PARTICIPANT',text.slice(index,index+Math.max(rawNeedle.length,matched.length)),index,text);
  }
}

ledger.updated_at=now;
ledger.summary={
  active_area_evidence_examined:examined,
  facts_total:ledger.facts.length,
  facts_added_this_run:added,
  by_competition_class:Object.fromEntries([...new Set(ledger.facts.map(x=>x.competition_class))].sort().map(k=>[k,ledger.facts.filter(x=>x.competition_class===k).length])),
  by_fact_type:Object.fromEntries([...allowedTypes].map(k=>[k,ledger.facts.filter(x=>x.fact_type===k).length]))
};
write(FACTS,ledger);
console.log('POLITICAL_MAYHEM_CONTEST_FACT_EXTRACTION_OK',`areas=${examined}`,`facts=${ledger.facts.length}`,`added=${added}`);
