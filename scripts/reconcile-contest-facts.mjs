import fs from 'node:fs';

const FACTS='data/runtime/contest-facts.json';
const AREAS='data/runtime/area-evidence-records.json';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const compact=s=>String(s??'').replace(/\s+/g,' ').trim();

const ledger=read(FACTS);
const areas=read(AREAS);
ledger.facts ||= [];
const activeAreaIds=new Set((areas.records||[]).filter(x=>x.routing_state==='SUBSTANTIVE_CONTENT_ROUTED').map(x=>x.area_evidence_id));
const now=new Date().toISOString();

const explicitVote=/(?:negatived on division|carried on division|resolved on division|division result|division was called|division was required|\bvote(?:d|s|ing)?\b|\bagreed to\b|\bnegatived\b|\bcarried\b|\bdefeated\b)/i;
const explicitProcedure=/(?:notice of motion|disallowance|motion to disallow|standing orders|suspension of standing orders|censure motion|referr(?:al|ed) to committee|procedural motion|closure motion|guillotine|removed from the notice paper|negatived on division|carried on division|resolved on division|division result|division was called|division was required)/i;

let retracted=0,reactivated=0;
for(const fact of ledger.facts){
  const parentActive=activeAreaIds.has(fact.area_evidence_id);
  const text=compact(`${fact.evidence_match||''} ${fact.evidence_text||''}`);
  let valid=parentActive;
  let reason=parentActive?null:'PARENT_AREA_RETRACTED';

  if(valid&&fact.fact_type==='VOTE_OR_DIVISION'&&!explicitVote.test(text)){
    valid=false;
    reason='VOTE_OR_DIVISION_REQUIRES_EXPLICIT_PARLIAMENTARY_VOTE_CONTEXT';
  }
  if(valid&&fact.competition_class==='PARLIAMENTARY_PROCEDURE'&&['CONTEST_OBJECT','PROCEDURAL_ACTION','STAGE','VOTE_OR_DIVISION'].includes(fact.fact_type)&&!explicitProcedure.test(text)){
    valid=false;
    reason='PARLIAMENTARY_PROCEDURE_REQUIRES_EXPLICIT_PROCEDURAL_CONTEXT';
  }

  fact.fact_state_history=Array.isArray(fact.fact_state_history)?fact.fact_state_history:[];
  if(!valid&&fact.fact_state!=='RETRACTED_EXTRACTION_NOISE'){
    fact.fact_state_history.push({from:fact.fact_state||'OBSERVED_SOURCE_TEXT',to:'RETRACTED_EXTRACTION_NOISE',at:now,reason});
    fact.fact_state='RETRACTED_EXTRACTION_NOISE';
    fact.retracted_at=now;
    fact.retraction_reason=reason;
    retracted++;
  }else if(valid&&fact.fact_state==='RETRACTED_EXTRACTION_NOISE'){
    fact.fact_state_history.push({from:'RETRACTED_EXTRACTION_NOISE',to:'OBSERVED_SOURCE_TEXT',at:now,reason:'FACT_CONTEXT_RESTORED'});
    fact.fact_state='OBSERVED_SOURCE_TEXT';
    fact.retracted_at=null;
    fact.retraction_reason=null;
    reactivated++;
  }
}

const activeFacts=ledger.facts.filter(x=>x.fact_state==='OBSERVED_SOURCE_TEXT');
const retractedFacts=ledger.facts.filter(x=>x.fact_state==='RETRACTED_EXTRACTION_NOISE');
ledger.updated_at=now;
ledger.summary={
  ...(ledger.summary||{}),
  facts_total:ledger.facts.length,
  active_facts:activeFacts.length,
  retracted_facts:retractedFacts.length,
  facts_retracted_this_run:retracted,
  facts_reactivated_this_run:reactivated,
  by_competition_class:Object.fromEntries([...new Set(activeFacts.map(x=>x.competition_class))].sort().map(k=>[k,activeFacts.filter(x=>x.competition_class===k).length])),
  by_fact_type:Object.fromEntries((ledger.fact_types||[]).map(k=>[k,activeFacts.filter(x=>x.fact_type===k).length]))
};
write(FACTS,ledger);
console.log('POLITICAL_MAYHEM_CONTEST_FACT_RECONCILIATION_OK',`active=${activeFacts.length}`,`retracted=${retractedFacts.length}`,`newRetractions=${retracted}`,`reactivated=${reactivated}`);
