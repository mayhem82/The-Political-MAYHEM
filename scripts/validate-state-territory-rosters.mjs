import fs from 'node:fs';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const fail=[];
const assert=(condition,message)=>{if(!condition)fail.push(message)};
const unique=xs=>new Set(xs).size===xs.length;

const base=read('data/runtime/state-territory-parliamentary-players.json');
const qld=read('data/runtime/queensland-parliamentary-players.json');
const wa=read('data/runtime/western-australia-parliamentary-players.json');
const nsw=read('data/runtime/new-south-wales-parliamentary-players.json');
const competitions=read('data/runtime/political-competitions.json');
const manifest=read('data/runtime/forward-ingestion-manifest.json');

assert(base.rules?.jurisdictions_remain_distinct===true,'jurisdiction separation rule missing');
assert(base.rules?.independents_are_standalone_players===true,'standalone independent rule missing');
assert(base.rules?.no_synthetic_independent_team===true,'synthetic-independent prohibition missing');

const baseCompleted=base.coverage?.completed_jurisdictions||[];
assert(baseCompleted.includes('AUS-ACT'),'ACT not marked complete');
assert(baseCompleted.includes('AUS-NT'),'NT not marked complete');
assert(base.coverage?.completed_player_count===50,`ACT/NT player count expected 50, got ${base.coverage?.completed_player_count}`);

for(const j of base.jurisdictions||[]){
  const players=j.players||[];
  const partyPlayers=players.filter(p=>p.party_id);
  const independents=players.filter(p=>!p.party_id);
  const teamCount=(j.teams||[]).reduce((n,t)=>n+Number(t.player_count||0),0);
  assert(players.length===j.counts?.total_players,`${j.competition_id} player total mismatch`);
  assert(partyPlayers.length===j.counts?.party_affiliated,`${j.competition_id} party-affiliated count mismatch`);
  assert(independents.length===j.counts?.independents,`${j.competition_id} independent count mismatch`);
  assert(teamCount===partyPlayers.length,`${j.competition_id} team counts do not reconcile`);
  assert(unique(players.map(p=>p.actor_id)),`${j.competition_id} actor IDs are not unique`);
  assert(players.every(p=>p.jurisdiction_id===j.competition_id),`${j.competition_id} contains cross-jurisdiction player`);
  assert(!(j.teams||[]).some(t=>/independent/i.test(t.name)),`${j.competition_id} has synthetic Independent team`);
  assert(j.integrity?.official_total_reconciled===true,`${j.competition_id} total not reconciled`);
  assert(j.integrity?.official_party_breakdown_reconciled===true,`${j.competition_id} party breakdown not reconciled`);
  assert(j.integrity?.all_current_players_ingested===true,`${j.competition_id} not marked complete`);
  const c=(competitions.competitions||[]).find(x=>x.competition_id===j.competition_id);
  assert(c?.ingestion_state==='CURRENT_PARLIAMENTARY_ROSTER_INGESTED',`${j.competition_id} competition ingestion state mismatch`);
  assert(c?.ingested_player_count===players.length,`${j.competition_id} competition player count mismatch`);
}

const act=(base.jurisdictions||[]).find(j=>j.competition_id==='AUS-ACT');
const nt=(base.jurisdictions||[]).find(j=>j.competition_id==='AUS-NT');
assert(act?.counts?.total_players===25,'ACT expected 25 players');
assert(nt?.counts?.total_players===25,'NT expected 25 players');

function compactRoster(data,expected){
  assert(data.competition_id===expected.id,`${expected.label} competition ID mismatch`);
  assert(data.status==='COMPLETE_CURRENT_PARLIAMENTARY_ROSTER',`${expected.label} roster not marked complete`);
  assert(Array.isArray(data.player_fields),`${expected.label} player_fields missing`);
  const rows=data.players||[];
  assert(rows.length===expected.total,`${expected.label} player rows expected ${expected.total}, got ${rows.length}`);
  assert(unique(rows.map(r=>r[0])),`${expected.label} actor IDs are not unique`);
  assert(data.counts?.total_players===expected.total,`${expected.label} total mismatch`);
  assert(data.counts?.party_affiliated===expected.party,`${expected.label} party-affiliated mismatch`);
  assert(data.counts?.independents===expected.ind,`${expected.label} independent mismatch`);
  assert(data.counts?.teams===expected.teams,`${expected.label} team count mismatch`);
  assert((data.teams||[]).reduce((n,t)=>n+Number(t.player_count||0),0)===expected.party,`${expected.label} team counts do not reconcile`);
  assert(!(data.teams||[]).some(t=>/independent/i.test(t.name)),`${expected.label} has synthetic Independent team`);
  assert(data.integrity?.official_total_reconciled===true,`${expected.label} total not reconciled`);
  assert(data.integrity?.official_party_breakdown_reconciled===true,`${expected.label} party breakdown not reconciled`);
  const c=(competitions.competitions||[]).find(x=>x.competition_id===expected.id);
  assert(c?.ingestion_state==='CURRENT_PARLIAMENTARY_ROSTER_INGESTED',`${expected.label} competition ingestion state mismatch`);
  assert(c?.ingested_player_count===expected.total,`${expected.label} competition player count mismatch`);
  for(const [abbr,count] of Object.entries(expected.parties||{})){
    const idx=data.player_fields.indexOf('party_abbreviation');
    assert(idx>=0,`${expected.label} party_abbreviation field missing`);
    if(idx>=0)assert(rows.filter(r=>r[idx]===abbr).length===count,`${expected.label} ${abbr} expected ${count}`);
  }
  for(const [chamber,count] of Object.entries(expected.chambers||{})){
    const idx=data.player_fields.indexOf('chamber');
    assert(idx>=0,`${expected.label} chamber field missing`);
    if(idx>=0)assert(rows.filter(r=>r[idx]===chamber).length===count,`${expected.label} ${chamber} expected ${count}`);
  }
  return rows;
}

const qldRows=compactRoster(qld,{id:'AUS-QLD',label:'Queensland',total:93,party:92,ind:1,teams:4,parties:{LNP:53,ALP:36,KAP:2,GRN:1,IND:1}});
const waRows=compactRoster(wa,{id:'AUS-WA',label:'Western Australia',total:95,party:94,ind:1,teams:8,parties:{ALP:61,LIB:16,NAT:8,GWA:4,ONP:2,AJP:1,AC:1,LCWA:1,IND:1},chambers:{LEGISLATIVE_ASSEMBLY:58,LEGISLATIVE_COUNCIL:37}});
const nswRows=compactRoster(nsw,{id:'AUS-NSW',label:'New South Wales',total:135,party:122,ind:13,teams:8,parties:{ALP:61,LIB:33,NAT:16,GRN:7,SFF:2,LCP:1,AJP:1,LP:1,IND:13},chambers:{LEGISLATIVE_ASSEMBLY:93,LEGISLATIVE_COUNCIL:42}});

assert(nsw.integrity?.official_chamber_totals_reconciled===true,'NSW chamber totals not reconciled');
assert(wa.integrity?.official_chamber_totals_reconciled===true,'WA chamber totals not reconciled');

const progress=competitions.ingestion_progress||{};
assert(progress.state_territory_jurisdictions_with_complete_current_player_rosters===5,'competition progress expected 5/8 complete');
assert(progress.state_territory_players_ingested===373,'competition progress expected 373 state/territory players');
assert((progress.remaining_jurisdictions||[]).length===3,'competition progress expected 3 remaining jurisdictions');
assert(!(progress.remaining_jurisdictions||[]).includes('AUS-NSW'),'NSW incorrectly remains roster-pending');
assert(manifest.structural_data_loaded?.state_and_territory_player_rosters==='5_OF_8_COMPLETE','ingestion manifest roster status mismatch');
assert(manifest.structural_data_loaded?.state_and_territory_players_ingested===373,'ingestion manifest player count mismatch');
assert((manifest.queues?.jurisdiction_ingestion||[]).length===3,'remaining jurisdiction ingestion queue expected 3');
for(const id of ['AUS-QLD','AUS-WA','AUS-NSW','AUS-ACT','AUS-NT'])assert((manifest.queues?.jurisdiction_evidence_activation||[]).includes(id),`${id} evidence activation not queued`);

const allIds=[
  ...(base.jurisdictions||[]).flatMap(j=>(j.players||[]).map(p=>`${j.competition_id}:${p.actor_id}`)),
  ...qldRows.map(r=>`AUS-QLD:${r[0]}`),
  ...waRows.map(r=>`AUS-WA:${r[0]}`),
  ...nswRows.map(r=>`AUS-NSW:${r[0]}`)
];
assert(unique(allIds),'state/territory jurisdiction-qualified actor IDs are not unique');

if(fail.length){
  console.error('POLITICAL_MAYHEM_STATE_TERRITORY_ROSTER_INTEGRITY_FAILED');
  for(const message of fail)console.error('- '+message);
  process.exit(1);
}
console.log('POLITICAL_MAYHEM_STATE_TERRITORY_ROSTER_INTEGRITY_PASS','jurisdictions=5','players=373','NSW=135','QLD=93','WA=95','ACT=25','NT=25');
