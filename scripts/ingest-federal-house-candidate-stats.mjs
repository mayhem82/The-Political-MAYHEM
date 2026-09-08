import fs from 'node:fs';

const OUT='data/runtime/federal-house-electoral-performance-v2.json';
const PLAYERS='data/runtime/federal-parliamentary-players.json';
const EVENT='2025 Federal Election';
const AEC_FP='https://results.aec.gov.au/31496/Website/Downloads/HouseFirstPrefsByCandidateByVoteTypeDownload-31496.csv';
const MIRROR_FP='https://raw.githubusercontent.com/rNLKJA/public-services-open-source-data/master/datasets/au-federal-election-results/raw/HouseFirstPrefsByCandidateByVoteTypeDownload-31496.csv';
const AEC_SEAT='https://results.aec.gov.au/31496/Website/HouseSeatSummary-31496.htm';

const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const num=s=>{const x=Number(String(s??'').replace(/[,+%]/g,'').trim());return Number.isFinite(x)?x:null};
const round2=n=>Math.round(Number(n)*100)/100;
const decode=s=>String(s??'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
const strip=s=>decode(String(s??'').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();

function parseCsv(text){
  const lines=String(text).replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.length);
  const start=lines.findIndex(x=>/^StateAb,|^DivisionID,|^DivisionNm,/.test(x));
  if(start<0) throw new Error('CSV header not found');
  const parseLine=line=>{const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){cur+='"';i++;}else q=!q;}else if(c===','&&!q){out.push(cur);cur='';}else cur+=c;}out.push(cur);return out};
  const header=parseLine(lines[start]);
  return lines.slice(start+1).map(parseLine).filter(r=>r.length>=header.length).map(r=>Object.fromEntries(header.map((h,i)=>[h,r[i]??''])));
}

async function fetchText(url){
  const r=await fetch(url,{headers:{'user-agent':'Political-MAYHEM/1.0 (+https://github.com/mayhem82/The-Political-MAYHEM)','accept':'text/html,text/csv,text/plain,*/*'}});
  if(!r.ok) throw new Error(`${url} -> ${r.status}`);
  return await r.text();
}

async function firstPreferences(){
  let text,source,state;
  try{ text=await fetchText(AEC_FP); source=AEC_FP; state='AEC_PRIMARY_DIRECT'; }
  catch(e){
    console.warn(`AEC first-preference direct fetch failed: ${e.message}; using frozen structured mirror`);
    text=await fetchText(MIRROR_FP); source=MIRROR_FP; state='AEC_PRIMARY_STRUCTURED_MIRROR';
  }
  if(!/Phase:FinalResults/i.test(text.split(/\r?\n/,1)[0]||'')) throw new Error('First-preference source is not marked FinalResults');
  return {rows:parseCsv(text),source,state};
}

async function seatSummary(){
  const html=await fetchText(AEC_SEAT);
  if(!/These results are final/i.test(strip(html))) throw new Error('AEC seat summary is not marked final');
  const rows=[];
  for(const m of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)){
    const cells=[...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(x=>strip(x[1]));
    if(cells.length<8||norm(cells[0])==='division') continue;
    const tcp=num(cells[4]),margin=num(cells[5]),swing=num(cells[6]);
    if(!cells[0]||tcp==null||margin==null) continue;
    rows.push({division:cells[0],state:cells[1],previous_party:cells[2],successful_party:cells[3],tcp_percent:tcp,tcp_margin_votes:margin,tcp_swing_points:swing,declared:cells[7]});
  }
  if(rows.length!==150) throw new Error(`AEC final seat summary parsed ${rows.length} rows, expected 150`);
  return {rows,source:AEC_SEAT,state:'AEC_PRIMARY_DIRECT_FINAL'};
}

function surnameMatches(currentName,aecSurname){
  const sn=norm(aecSurname); if(!sn) return false;
  return norm(currentName).includes(sn);
}

const current=JSON.parse(fs.readFileSync(PLAYERS,'utf8'));
const existing=JSON.parse(fs.readFileSync(OUT,'utf8'));
const house=(current.players||[]).filter(p=>p.chamber==='HOUSE');
if(house.length!==150) throw new Error(`Current House roster has ${house.length}, expected 150`);

const [fp,seat]=await Promise.all([firstPreferences(),seatSummary()]);
const byDivision=new Map();
for(const row of fp.rows){
  const k=norm(row.DivisionNm); if(!k) continue;
  if(!byDivision.has(k)) byDivision.set(k,[]);
  byDivision.get(k).push(row);
}
const seatByDivision=new Map(seat.rows.map(r=>[norm(r.division),r]));
const currentByDivision=new Map(house.map(p=>[norm(p.division),p]));

const records=[];
const historicalWinners=[];
const overrides={};
for(const [k,rows] of byDivision){
  const winner=rows.find(r=>String(r.Elected).toUpperCase()==='Y'&&String(r.CandidateID)!=='999');
  if(!winner) continue;
  const formal=rows.filter(r=>String(r.CandidateID)!=='999'&&norm(r.Surname)!=='informal').reduce((n,r)=>n+(num(r.TotalVotes)||0),0);
  const primaryVotes=num(winner.TotalVotes);
  const primaryPercent=formal&&primaryVotes!=null?round2(primaryVotes/formal*100):null;
  const summary=seatByDivision.get(k)||null;
  const player=currentByDivision.get(k)||null;
  const base={
    event:EVENT,
    division:winner.DivisionNm,
    state:winner.StateAb,
    candidate_id:Number(winner.CandidateID),
    candidate_name:`${winner.GivenNm} ${winner.Surname}`.replace(/\s+/g,' ').trim(),
    election_party_code:winner.PartyAb||null,
    election_party_name:winner.PartyNm||null,
    primary_votes:primaryVotes,
    formal_votes:formal,
    primary_vote_percent:primaryPercent,
    primary_swing_points:num(winner.Swing),
    tcp_percent:summary?.tcp_percent??null,
    tcp_margin_votes:summary?.tcp_margin_votes??null,
    tcp_swing_points:summary?.tcp_swing_points??null,
    successful_party:summary?.successful_party??null,
    declared:summary?.declared??null,
    source_class:'PRIMARY_ELECTORAL_AUTHORITY'
  };
  if(player&&surnameMatches(player.name,winner.Surname)){
    records.push({...base,actor_id:player.actor_id,current_player_name:player.name});
    if(norm(player.party)!==norm(winner.PartyAb)&&norm(player.party)!==norm(winner.PartyNm)){
      overrides[player.actor_id]={election_party_code:winner.PartyAb||null,reason:`Current affiliation differs from election-day affiliation; ${player.name} was elected in ${winner.DivisionNm} in 2025 as ${winner.PartyNm||winner.PartyAb}.`};
    }
  }else{
    historicalWinners.push({...base,current_actor_id:player?.actor_id??null,current_player_name:player?.name??null,replacement_state:player?'CURRENT_MEMBER_DIFFERS_FROM_2025_WINNER':'NO_CURRENT_PLAYER_MATCH'});
    if(player) overrides[player.actor_id]={election_party_code:null,reason:`Current member ${player.name} was not the 2025 general-election winner for ${winner.DivisionNm}; 2025 candidate statistics must not be attributed to this actor.`};
  }
}

const later=(existing.candidate_specific_results||[]).filter(r=>String(r.event)!==EVENT);
const combined=[...records,...later];
const currentIds=new Set(house.map(p=>p.actor_id));
const coveredCurrent=new Set(combined.filter(r=>currentIds.has(r.actor_id)).map(r=>r.actor_id));
const unresolved=house.filter(p=>!coveredCurrent.has(p.actor_id)).map(p=>({actor_id:p.actor_id,name:p.name,division:p.division,reason:'No candidate-specific election record for the current member is loaded yet'}));

const out={
  ...existing,
  snapshot_id:'FEDERAL-HOUSE-ELECTORAL-PERFORMANCE-002',
  captured_at:new Date().toISOString(),
  status:'COMPLETE_150_DIVISION_CONTEXT_AND_2025_ELECTED_CANDIDATE_STATS_WITH_CURRENT_MEMBER_RECONCILIATION',
  sources:[
    {publisher:'Australian Electoral Commission',source_url:AEC_FP,source_state:'PRIMARY_FINAL_RESULTS',purpose:'2025 House candidate first-preference totals and swing'},
    {publisher:'Australian Electoral Commission',source_url:AEC_SEAT,source_state:'PRIMARY_FINAL_RESULTS',purpose:'Final winning TCP percentage, margin and swing by division'},
    ...(fp.state==='AEC_PRIMARY_STRUCTURED_MIRROR'?[{publisher:'Structured mirror of AEC final CSV',source_url:fp.source,source_state:'FALLBACK_MIRROR_OF_PRIMARY_FINAL_RESULTS',purpose:'Machine-readable copy used because direct AEC CSV acquisition failed'}]:[])
  ],
  rules:{
    ...(existing.rules||{}),
    current_party_affiliation_must_not_rewrite_election_day_party:true,
    current_member_replacement_must_not_inherit_predecessor_election_stats:true,
    candidate_specific_primary_is_derived_only_from_candidate_total_votes_over_division_formal_candidate_votes:true,
    final_tcp_is_taken_from_aec_final_seat_summary:true,
    missing_candidate_specific_result_is_not_zero:true
  },
  current_player_election_party_overrides:{...(existing.current_player_election_party_overrides||{}),...overrides},
  candidate_specific_results:combined,
  historical_2025_winners_not_current_members:historicalWinners,
  coverage:{
    ...(existing.coverage||{}),
    division_context_records:(existing.division_results||[]).length,
    division_context_total:150,
    elected_2025_candidate_records:records.length+historicalWinners.length,
    elected_2025_candidate_expected:150,
    current_house_players:150,
    current_players_with_candidate_specific_stats:coveredCurrent.size,
    current_players_without_candidate_specific_stats:unresolved.length,
    current_player_candidate_specific_expansion:unresolved.length?'EXPANDING':'COMPLETE'
  },
  unresolved_current_house_players:unresolved,
  provenance:{
    primary_first_preferences:AEC_FP,
    primary_seat_summary:AEC_SEAT,
    first_preference_acquisition_state:fp.state,
    seat_summary_acquisition_state:seat.state,
    mirror_used_for_first_preferences:fp.state==='AEC_PRIMARY_STRUCTURED_MIRROR'
  }
};

fs.writeFileSync(OUT,JSON.stringify(out,null,2)+'\n');
console.log(`FEDERAL_HOUSE_CANDIDATE_STATS_INGESTED records2025=${records.length} historicalWinners=${historicalWinners.length} laterEvents=${later.length} currentCovered=${coveredCurrent.size}/150 unresolved=${unresolved.length} fp=${fp.state} seat=${seat.state}`);
