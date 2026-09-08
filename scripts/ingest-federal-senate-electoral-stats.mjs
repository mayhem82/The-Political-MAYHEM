import fs from 'node:fs';

const OUT='data/runtime/federal-senate-electoral-performance.json';
const PLAYERS='data/runtime/federal-parliamentary-players.json';
const EVENTS=[
  {year:2025,event_id:'31496',label:'2025 Federal Election'},
  {year:2022,event_id:'27966',label:'2022 Federal Election'}
];

const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const tokens=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).filter(Boolean);
const num=s=>{const x=Number(String(s??'').replace(/[,+%]/g,'').trim());return Number.isFinite(x)?x:null};
const round2=n=>Math.round(Number(n)*100)/100;
const state=s=>String(s??'').toUpperCase();

function parseCsv(text){
  const lines=String(text).replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.length);
  const start=lines.findIndex(x=>/^StateAb,/.test(x));
  if(start<0) throw new Error('CSV header not found');
  const parseLine=line=>{const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){cur+='"';i++;}else q=!q;}else if(c===','&&!q){out.push(cur);cur='';}else cur+=c;}out.push(cur);return out};
  const header=parseLine(lines[start]);
  return lines.slice(start+1).map(parseLine).filter(r=>r.length>=header.length).map(r=>Object.fromEntries(header.map((h,i)=>[h,r[i]??''])));
}

async function fetchCsv(url){
  const r=await fetch(url,{headers:{'user-agent':'Political-MAYHEM/1.0 (+https://github.com/mayhem82/The-Political-MAYHEM)','accept':'text/csv,text/plain,*/*'}});
  if(!r.ok) throw new Error(`${url} -> ${r.status}`);
  const text=await r.text();
  if(!/Phase:FinalResults/i.test(text.split(/\r?\n/,1)[0]||'')) throw new Error(`${url} not marked FinalResults`);
  return parseCsv(text);
}

function surnameTokensMatch(currentName,aecSurname){
  const c=tokens(currentName),s=tokens(aecSurname);
  if(!s.length||s.length>c.length) return false;
  return s.every((x,i)=>c[c.length-s.length+i]===x);
}
function nameMatches(currentName,given,surname){
  if(!surnameTokensMatch(currentName,surname)) return false;
  const c=tokens(currentName),g=tokens(given);
  if(!c.length||!g.length) return false;
  return c[0][0]===g[0][0];
}

function groupAlias(partyAb,stateAb){
  if(partyAb==='GVIC') return ['GRN','GVIC'];
  if(['LP','NP'].includes(partyAb)&&['NSW','VIC'].includes(stateAb)) return [partyAb,'LPNP','LNP'];
  if(partyAb==='CLP') return ['CLP'];
  return [partyAb];
}

const current=JSON.parse(fs.readFileSync(PLAYERS,'utf8'));
const senators=(current.players||[]).filter(p=>p.chamber==='SENATE');
if(senators.length!==76) throw new Error(`Current Senate roster has ${senators.length}, expected 76`);

const eventData=[];
for(const evt of EVENTS){
  const base=`https://results.aec.gov.au/${evt.event_id}/Website/Downloads`;
  const electedUrl=`${base}/SenateSenatorsElectedDownload-${evt.event_id}.csv`;
  const prefsUrl=`${base}/SenateFirstPrefsByStateByGroupByVoteTypeDownload-${evt.event_id}.csv`;
  const [elected,prefs]=await Promise.all([fetchCsv(electedUrl),fetchCsv(prefsUrl)]);
  if(elected.length!==40) throw new Error(`${evt.year} elected Senator count ${elected.length}, expected 40`);
  const prefsByState=new Map();
  for(const r of prefs){
    const st=state(r.StateAb);if(!prefsByState.has(st))prefsByState.set(st,[]);prefsByState.get(st).push(r);
  }
  const stateFormal={};
  for(const [st,rows] of prefsByState){stateFormal[st]=rows.reduce((n,r)=>n+(num(r.TotalVotes)||0),0)}
  eventData.push({...evt,elected,prefsByState,stateFormal,electedUrl,prefsUrl});
}

const currentRecords=[];
const historicalElected=[];
const matchedCurrent=new Set();

for(const evt of eventData){
  for(const e of evt.elected){
    const st=state(e.StateAb);
    const possible=senators.filter(p=>state(p.state)===st&&!matchedCurrent.has(p.actor_id)&&nameMatches(p.name,e.GivenNm,e.Surname));
    if(possible.length>1) throw new Error(`${evt.year} ambiguous current Senator match: ${e.GivenNm} ${e.Surname} ${st}`);
    const partyAb=e.PartyAb||null;
    const groupRows=evt.prefsByState.get(st)||[];
    const aliases=groupAlias(partyAb,st);
    let group=groupRows.find(r=>aliases.includes(r.GroupAb));
    if(!group&&partyAb) group=groupRows.find(r=>norm(r.GroupNm).includes(norm(e.PartyNm))||norm(e.PartyNm).includes(norm(r.GroupNm)));
    const formal=evt.stateFormal[st]||null;
    const groupVotes=group?num(group.TotalVotes):null;
    const groupPercent=formal&&groupVotes!=null?round2(groupVotes/formal*100):null;
    const record={
      event:evt.label,
      election_year:evt.year,
      event_id:evt.event_id,
      state:st,
      elected_order:num(e.ElectedOrder),
      election_party_code:partyAb,
      election_party_name:e.PartyNm||null,
      candidate_name:`${e.GivenNm} ${e.Surname}`.replace(/\s+/g,' ').trim(),
      group_code:group?.GroupAb||null,
      group_name:group?.GroupNm||null,
      group_first_preference_votes:groupVotes,
      state_formal_votes:formal,
      group_first_preference_percent:groupPercent,
      source_class:'PRIMARY_ELECTORAL_AUTHORITY',
      source_refs:[evt.electedUrl,evt.prefsUrl]
    };
    if(possible.length===1){
      const p=possible[0];
      currentRecords.push({...record,actor_id:p.actor_id,current_player_name:p.name,reconciliation_state:'CURRENT_SENATOR_MATCHED_TO_ELECTED_RECORD'});
      matchedCurrent.add(p.actor_id);
    }else{
      historicalElected.push({...record,reconciliation_state:'ELECTED_RECORD_NOT_CURRENT_SENATOR'});
    }
  }
}

const unresolved=senators.filter(p=>!matchedCurrent.has(p.actor_id)).map(p=>({
  actor_id:p.actor_id,name:p.name,state:state(p.state),party:p.party,reason:'Current Senator not matched to a 2025 or 2022 elected-Senator record. Do not inherit a predecessor electoral record.'
}));

const currentByEvent=Object.fromEntries(EVENTS.map(e=>[String(e.year),currentRecords.filter(r=>r.election_year===e.year).length]));
const historicalByEvent=Object.fromEntries(EVENTS.map(e=>[String(e.year),historicalElected.filter(r=>r.election_year===e.year).length]));
const groupContextResolved=currentRecords.filter(r=>r.group_first_preference_percent!=null).length;

const out={
  snapshot_id:'FEDERAL-SENATE-ELECTORAL-PERFORMANCE-001',
  scope:'Australia — Federal Senate',
  captured_at:new Date().toISOString(),
  status:unresolved.length?'CURRENT_SENATE_ELECTORAL_COHORTS_PARTIALLY_RECONCILED':'CURRENT_SENATE_ELECTORAL_COHORTS_RECONCILED',
  sources:EVENTS.flatMap(e=>[
    {publisher:'Australian Electoral Commission',event:e.label,source_url:`https://results.aec.gov.au/${e.event_id}/Website/Downloads/SenateSenatorsElectedDownload-${e.event_id}.csv`,source_state:'PRIMARY_FINAL_RESULTS',purpose:'Elected senators and elected order'},
    {publisher:'Australian Electoral Commission',event:e.label,source_url:`https://results.aec.gov.au/${e.event_id}/Website/Downloads/SenateFirstPrefsByStateByGroupByVoteTypeDownload-${e.event_id}.csv`,source_state:'PRIMARY_FINAL_RESULTS',purpose:'State/group first-preference context'}
  ]),
  rules:{
    group_first_preference_is_team_context_not_individual_candidate_primary:true,
    below_the_line_candidate_vote_must_not_be_inferred_from_group_vote:true,
    current_replacement_must_not_inherit_predecessor_election_stats:true,
    election_day_party_is_preserved:true,
    missing_group_context_is_not_zero:true,
    current_senator_must_match_state_and_name_before_elected_record_attribution:true,
    later_cohort_match_takes_precedence_by_processing_2025_before_2022:true
  },
  coverage:{
    current_senators:76,
    current_senators_with_elected_record:matchedCurrent.size,
    current_senators_without_elected_record:unresolved.length,
    current_senators_with_group_vote_context:groupContextResolved,
    elected_records_examined:80,
    current_matches_by_election_year:currentByEvent,
    historical_elected_not_current_by_election_year:historicalByEvent
  },
  current_senator_records:currentRecords.sort((a,b)=>a.state.localeCompare(b.state)||b.election_year-a.election_year||a.elected_order-b.elected_order),
  unresolved_current_senators:unresolved,
  historical_elected_not_current:historicalElected,
  provenance:{
    authority:'Australian Electoral Commission',
    acquisition:'DIRECT_AEC_FINAL_CSV',
    event_ids:EVENTS.map(e=>e.event_id),
    current_roster_source:PLAYERS
  }
};

fs.writeFileSync(OUT,JSON.stringify(out,null,2)+'\n');
console.log(`FEDERAL_SENATE_ELECTORAL_STATS_INGESTED current=${matchedCurrent.size}/76 unresolved=${unresolved.length} groupContext=${groupContextResolved}/${matchedCurrent.size} cohort2025=${currentByEvent['2025']} cohort2022=${currentByEvent['2022']}`);
