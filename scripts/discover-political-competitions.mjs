import fs from 'node:fs';
import crypto from 'node:crypto';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const compact=s=>String(s??'').replace(/\s+/g,' ').trim();
const norm=s=>compact(s).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const uniq=xs=>[...new Set(xs.filter(Boolean))];

const DISCOVERY='data/runtime/competition-discovery-candidates.json';
const EVENTS='data/runtime/intelligence-events.json';
const REVIEWS='data/runtime/signal-reviews.json';
const CYCLES='data/runtime/political-cycles.json';
const CYCLE_CLASSES='data/political-cycle-class-registry.json';
const CONTESTS='data/runtime/political-contests.json';
const SNAPSHOTS='data/runtime/source-snapshots.json';

const discovery=read(DISCOVERY);
const events=read(EVENTS);
const reviews=read(REVIEWS);
const cycles=read(CYCLES);
const cycleClasses=read(CYCLE_CLASSES);
const contests=read(CONTESTS);
const snapshots=read(SNAPSHOTS);

discovery.candidates ||= [];
discovery.jurisdiction_screening ||= [];
const now=new Date().toISOString();
const currentYear=new Date(now).getUTCFullYear();
const jurisdictions=['AUS-FED','AUS-NSW','AUS-VIC','AUS-QLD','AUS-WA','AUS-SA','AUS-TAS','AUS-ACT','AUS-NT'];
const labelToJurisdiction={
  'Australia':'AUS-FED','Federal':'AUS-FED','New South Wales':'AUS-NSW','NSW':'AUS-NSW','Victoria':'AUS-VIC','Queensland':'AUS-QLD','Western Australia':'AUS-WA','South Australia':'AUS-SA','Tasmania':'AUS-TAS','Australian Capital Territory':'AUS-ACT','ACT':'AUS-ACT','Northern Territory':'AUS-NT','NT':'AUS-NT'
};
const eventById=new Map((events.events||[]).map(x=>[x.event_id,x]));
const existingById=new Map(discovery.candidates.map(x=>[x.candidate_id,x]));
const examined=new Map(jurisdictions.map(j=>[j,new Set()]));
const snapshotIds=new Set((snapshots.snapshots||[]).map(x=>x.snapshot_id));
const substantiveEventTypes=new Set(['AREA_EVIDENCE_INGESTED','AREA_EVIDENCE_REACTIVATED','AREA_EVIDENCE_INTELLIGENCE_ENRICHED','AREA_EVIDENCE_RETRACTED','AREA_EVIDENCE_RETRACTION_ENRICHED']);
const latestSubstantiveByArea=new Map();
for(const event of events.events||[]){
  if(!event.area_evidence_id||!event.competition_class||!substantiveEventTypes.has(event.event_type)) continue;
  const prior=latestSubstantiveByArea.get(event.area_evidence_id);
  if(!prior||Date.parse(event.captured_at||0)>=Date.parse(prior.captured_at||0)) latestSubstantiveByArea.set(event.area_evidence_id,event);
}

const cycleClassById=new Map((cycleClasses.classes||[]).map(x=>[x.cycle_class,x]));
const cycleJurisdictionId=cycle=>cycle.jurisdiction_id||labelToJurisdiction[cycle.jurisdiction]||null;
const contestJurisdictionId=contest=>contest.jurisdiction_id||labelToJurisdiction[contest.jurisdiction]||null;
const compatibleCycle=(jurisdictionId,competitionClass)=>{
  if(!competitionClass) return null;
  return (cycles.cycles||[]).find(cycle=>{
    if(cycle.status!=='ACTIVE'||cycleJurisdictionId(cycle)!==jurisdictionId) return false;
    const allowed=new Set(cycleClassById.get(cycle.cycle_class)?.allowed_competition_classes||[]);
    return allowed.has(competitionClass);
  })||null;
};

const currentStructuredRecord=text=>{
  const years=[...String(text).matchAll(/\b(20\d{2})\b/g)].map(m=>Number(m[1]));
  return years.length===0||years.includes(currentYear);
};

const screen=(text,sourceClass='')=>{
  const raw=compact(text);
  const t=raw.toLowerCase();
  if(!raw) return null;

  if(/\b(no[- ]confidence|confidence motion|motion of confidence|motion of no confidence|confidence and supply|confidence agreement)\b/.test(t)) return 'CONFIDENCE_SUPPLY';
  if(/\b(leadership challenge|leadership ballot|leadership spill|leadership contest|leadership vacancy|spill motion|ballot for leader|contest for leader)\b/.test(t)) return 'LEADERSHIP';

  const budgetTerm=/\b(budget|appropriation)\b/.test(t);
  const resistanceTerm=/\b(oppose|opposition|block|blocked|reject|rejected|defeat|defeated|vote|voting|passage|amend|amendment|crossbench|negotiate|negotiation|resist|resistance|challenge)\b/.test(t);
  if(budgetTerm&&resistanceTerm) return 'BUDGET';

  const formalBill=/\b[A-Z][A-Za-z0-9'’()&,\- ]{2,100}\sBill(?:\s20\d{2})?\b/.test(raw);
  const billPhrase=/\b(amendment bill|bill introduced|introduces? .{0,60} bill|bill before parliament|bill passes|bill passed|bill defeated|legislation before parliament|draft legislation|proposed legislation)\b/.test(t);
  if(formalBill||billPhrase) return 'LEGISLATION';

  if(/\b(censure motion|suspension of standing orders|standing orders suspension|closure motion|guillotine motion|procedural motion|disallowance motion|motion to disallow|refer(?:ral)? to committee)\b/.test(t)) return 'PROCEDURAL';
  if(sourceClass==='PRIMARY_PARLIAMENT'&&/\b(motion|division|amendment)\b/.test(t)) return 'PROCEDURAL';

  const explicitElection=/\b(by[- ]?election|general election|state election|federal election|territory election|legislative assembly election|government formation)\b/.test(t);
  const electionProcess=(/\b(election|electoral)\b/.test(t)&&/\b(nomination|candidate|candidacy|voting|polling day|writ|preference)\b/.test(t));
  if(explicitElection||electionProcess) return 'ELECTION';

  const publicActors=/\b(public|community|communities|citizen|citizens|resident|residents|campaign|campaigners|advocacy|petition|protest|protesters)\b/.test(t);
  const publicDemand=/\b(demand|demands|call for|calls for|petition|campaign|protest|submission|advocacy|pressure|urged|urge)\b/.test(t);
  const institutionalResponse=/\b(government|council|department|minister|agency|authority|parliament|institution)\b/.test(t)&&/\b(refuse|refused|reject|rejected|resist|resisted|delay|delayed|concede|conceded|backdown|back down|reverse|reversed|change|changed|agree|agreed|inaction|inertia)\b/.test(t);
  if(publicActors&&publicDemand&&institutionalResponse) return 'PUBLIC_PRESSURE';

  const implementation=/\b(implement|implementation|enact|enactment|regulation|regulatory|commence|commencement)\b/.test(t);
  if(implementation&&resistanceTerm) return 'POLICY_ENACTMENT';
  return null;
};

const familyForClass=competitionClass=>({
  ELECTORAL:'ELECTION',
  LEGISLATIVE:'LEGISLATION',
  LEADERSHIP:'LEADERSHIP',
  CONFIDENCE_SUPPLY:'CONFIDENCE_SUPPLY',
  BUDGET:'BUDGET',
  POLICY_ENACTMENT:'POLICY_ENACTMENT',
  PARLIAMENTARY_PROCEDURE:'PROCEDURAL',
  PUBLIC_PRESSURE:'PUBLIC_PRESSURE'
})[competitionClass]||null;

const likelyCoveredByRegisteredContest=(jurisdictionId,family,subject)=>{
  if(family!=='ELECTION') return false;
  const s=norm(subject);
  return (contests.contests||[]).some(contest=>{
    if(contest.competition_class!=='ELECTORAL'||contestJurisdictionId(contest)!==jurisdictionId) return false;
    const c=norm(contest.name);
    if(s.includes('state election')&&c.includes('state election')) return true;
    if(s.includes('government formation')&&c.includes('government formation')) return true;
    const sy=(s.match(/\b20\d{2}\b/)||[])[0];
    const cy=(c.match(/\b20\d{2}\b/)||[])[0];
    return Boolean(sy&&cy&&sy===cy&&s.includes('election')&&c.includes('election'));
  });
};

const classForFamily=family=>({
  ELECTION:'ELECTORAL',LEGISLATION:'LEGISLATIVE',LEADERSHIP:'LEADERSHIP',CONFIDENCE_SUPPLY:'CONFIDENCE_SUPPLY',BUDGET:'BUDGET',PROCEDURAL:'PARLIAMENTARY_PROCEDURE',POLICY_ENACTMENT:'POLICY_ENACTMENT',PUBLIC_PRESSURE:'PUBLIC_PRESSURE'
})[family]||null;

const stateAndBlockers=(family,cycle)=>{
  let state='REVIEW_REQUIRED';
  let blockers=[];
  if(family==='LEGISLATION'){
    state='EVIDENCE_GAP';
    blockers=['MATERIAL_RESISTANCE_NOT_YET_EVIDENCED','SUPPORTING_SIDE_NOT_YET_RESOLVED','OPPOSING_SIDE_NOT_YET_RESOLVED'];
  }else if(family==='ELECTION'){
    blockers=['DISTINCT_ELECTORAL_CONTEST_SCOPE_REQUIRES_REVIEW'];
  }else{
    blockers=[({LEADERSHIP:'MATERIAL_OPPOSITION_OR_BALLOT_NOT_YET_RESOLVED',CONFIDENCE_SUPPLY:'CONFIDENCE_OR_SUPPLY_THRESHOLD_REQUIRES_REVIEW',BUDGET:'MATERIAL_BUDGET_RESISTANCE_REQUIRES_REVIEW',PROCEDURAL:'MATERIAL_PROCEDURAL_OPPOSITION_REQUIRES_REVIEW',POLICY_ENACTMENT:'MATERIAL_POLICY_RESISTANCE_REQUIRES_REVIEW',PUBLIC_PRESSURE:'DEFINED_PUBLIC_DEMAND_AND_INSTITUTIONAL_RESISTANCE_REQUIRE_REVIEW'})[family]||'COMPETITION_THRESHOLD_REQUIRES_REVIEW'];
  }
  if(!cycle) blockers.push('REGISTERED_COMPATIBLE_CYCLE_REQUIRED');
  return {state,blockers};
};

const substantiveStateAndBlockers=event=>{
  const state=({
    EVIDENCE_GAP:'EVIDENCE_GAP',
    REVIEW_REQUIRED:'REVIEW_REQUIRED',
    ELIGIBLE_FOR_REGISTRATION:'ELIGIBLE_FOR_REGISTRATION',
    NOT_A_MATCH:'REJECTED_NOT_COMPETITION'
  })[event.threshold_state]||null;
  if(!state) return {state:'REVIEW_REQUIRED',blockers:['THRESHOLD_EVALUATION_REQUIRED']};
  return {state,blockers:uniq(event.threshold_blockers||[])};
};

const candidateId=(jurisdictionId,family,subject)=>{
  const hash=crypto.createHash('sha256').update(`${jurisdictionId}|${family}|${norm(subject)}`).digest('hex').slice(0,16);
  return `DISC-${jurisdictionId.replace('AUS-','')}-${family}-${hash}`;
};

let added=0,merged=0,substantive=0,thresholdTransitions=0;
const addCandidate=({jurisdictionId,family,subject,event,reviewId=null})=>{
  if(!jurisdictions.includes(jurisdictionId)||!event?.source_snapshot_id||!snapshotIds.has(event.source_snapshot_id)) return;
  if(likelyCoveredByRegisteredContest(jurisdictionId,family,subject)) return;
  const proposedClass=classForFamily(family);
  const cycle=compatibleCycle(jurisdictionId,proposedClass);
  const isSubstantive=Boolean(event.area_evidence_id);
  const {state,blockers}=isSubstantive?substantiveStateAndBlockers(event):stateAndBlockers(family,cycle);
  const id=candidateId(jurisdictionId,family,subject);
  const summary=isSubstantive
    ? `Substantive source record body was acquired, routed to ${proposedClass}, and written into intelligence with retained detail, source-snapshot and stage-10 threshold lineage. Match registration remains a separate action.`
    : `Screened ${event.source_class||'political'} evidence contains language consistent with a ${family.toLowerCase().replaceAll('_',' ')} competition candidate. This is a discovery observation, not a registered contest or outcome inference.`;
  const areaMatches=isSubstantive
    ?discovery.candidates.filter(candidate=>candidate.competition_family===family&&(candidate.area_evidence_ids||[]).includes(event.area_evidence_id))
    :[];
  const areaExisting=isSubstantive
    ?areaMatches.find(candidate=>candidate.candidate_state==='REGISTERED')||areaMatches.find(candidate=>candidate.candidate_state!=='REJECTED_NOT_COMPETITION')||areaMatches.find(candidate=>!candidate.duplicate_of_candidate_id)||areaMatches[0]||null
    :null;
  const existing=areaExisting||existingById.get(id);
  if(existing){
    existing.source_snapshot_ids=uniq([...(existing.source_snapshot_ids||[]),event.source_snapshot_id]);
    existing.signal_event_ids=uniq([...(existing.signal_event_ids||[]),event.event_id]);
    existing.review_ids=uniq([...(existing.review_ids||[]),reviewId]);
    if(!existing.proposed_competition_class&&proposedClass) existing.proposed_competition_class=proposedClass;
    if(!existing.proposed_cycle_id&&cycle) existing.proposed_cycle_id=cycle.cycle_id;
    if(isSubstantive){
      existing.area_evidence_ids=uniq([...(existing.area_evidence_ids||[]),event.area_evidence_id]);
      existing.detail_version_ids=uniq([...(existing.detail_version_ids||[]),event.detail_version_id]);
      existing.evidence_summary=summary;
      if(existing.candidate_state!=='REGISTERED'){
        if(existing.candidate_state!==state){
          existing.state_history ||= [];
          existing.state_history.push({from:existing.candidate_state,to:state,at:event.captured_at||now,reason:'SUBSTANTIVE_THRESHOLD_EVALUATION_PROPAGATED'});
          existing.candidate_state=state;
          thresholdTransitions++;
        }
        existing.registration_blockers=[...blockers];
      }
    }
    existingById.set(id,existing);
    merged++;return;
  }
  const detectedAt=event.captured_at||now;
  const candidate={
    candidate_id:id,jurisdiction_id:jurisdictionId,competition_family:family,proposed_competition_class:proposedClass,proposed_cycle_id:cycle?.cycle_id||null,
    subject:compact(subject).slice(0,300),candidate_state:state,detected_at:detectedAt,
    source_snapshot_ids:[event.source_snapshot_id],signal_event_ids:[event.event_id],review_ids:reviewId?[reviewId]:[],
    area_evidence_ids:isSubstantive?[event.area_evidence_id]:[],detail_version_ids:isSubstantive?[event.detail_version_id]:[],
    evidence_summary:summary,registration_blockers:[...blockers],linked_contest_id:null,
    state_history:[{from:null,to:state,at:detectedAt,reason:isSubstantive?'SUBSTANTIVE_THRESHOLD_EVALUATION_PROPAGATED':'DETERMINISTIC_COMPETITION_FAMILY_SCREEN'}]
  };
  discovery.candidates.push(candidate);existingById.set(id,candidate);added++;
};

for(const review of reviews.reviews||[]){
  if(review.decision!=='PROMOTED_TO_SIGNAL'||!review.signal_event_id) continue;
  const event=eventById.get(review.signal_event_id);
  if(!event||!jurisdictions.includes(event.jurisdiction_id)) continue;
  examined.get(event.jurisdiction_id).add(event.event_id);
  for(const record of review.structured_evidence?.added_records||[]){
    const subject=compact(record.title||record.url||'');
    if(!currentStructuredRecord(subject)) continue;
    const family=screen(subject,event.source_class);
    if(family) addCandidate({jurisdictionId:event.jurisdiction_id,family,subject,event,reviewId:review.review_id});
  }
}

for(const event of events.events||[]){
  if(!jurisdictions.includes(event.jurisdiction_id)) continue;
  if(event.event_type==='SOURCE_CHANGED'||event.review_id) continue;
  const trusted=event.evidence_state==='VERIFIED'||event.semantic_review_state==='PROMOTED'||event.signal_state==='CONFIRMED_FACT';
  if(!trusted) continue;
  examined.get(event.jurisdiction_id).add(event.event_id);
  if(substantiveEventTypes.has(event.event_type)&&event.competition_class){
    if(latestSubstantiveByArea.get(event.area_evidence_id)?.event_id!==event.event_id) continue;
    const family=familyForClass(event.competition_class);
    const subject=compact(event.record_title||event.claim||event.record_url||'');
    if(family&&subject){addCandidate({jurisdictionId:event.jurisdiction_id,family,subject,event});substantive++;}
    continue;
  }
  const subject=compact(event.claim||event.observed_behaviour||'');
  const family=screen(subject,event.source_class);
  if(family) addCandidate({jurisdictionId:event.jurisdiction_id,family,subject,event});
}

for(const jurisdictionId of jurisdictions){
  let row=discovery.jurisdiction_screening.find(x=>x.jurisdiction_id===jurisdictionId);
  if(!row){row={jurisdiction_id:jurisdictionId,screening_state:'NOT_YET_SCREENED',last_screened_at:null,signals_examined:0,candidates_detected:0};discovery.jurisdiction_screening.push(row);}
  row.screening_state='SCREENED';row.last_screened_at=now;row.signals_examined=examined.get(jurisdictionId).size;row.candidates_detected=discovery.candidates.filter(x=>x.jurisdiction_id===jurisdictionId).length;
}

discovery.last_screened_at=now;
discovery.last_screen_summary={signals_examined:[...examined.values()].reduce((n,set)=>n+set.size,0),candidates_total:discovery.candidates.length,candidates_added:added,candidate_lineage_merges:merged,substantive_area_events_examined:substantive,threshold_state_transitions:thresholdTransitions,registered_contests_unchanged:true};
write(DISCOVERY,discovery);
console.log('POLITICAL_MAYHEM_COMPETITION_DISCOVERY_OK',`signals=${discovery.last_screen_summary.signals_examined}`,`candidates=${discovery.candidates.length}`,`added=${added}`,`merged=${merged}`,`substantive=${substantive}`,`thresholdTransitions=${thresholdTransitions}`,'registeredContestsChanged=0');
