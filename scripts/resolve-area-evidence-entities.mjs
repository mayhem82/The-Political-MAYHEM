import fs from 'node:fs';

const AREAS='data/runtime/area-evidence-records.json';
const DETAILS='data/runtime/source-detail-snapshots.json';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const exists=p=>fs.existsSync(p);
const uniq=xs=>[...new Set(xs.filter(Boolean))];

function norm(value=''){
  return String(value)
    .normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[’']/g,' ')
    .replace(/[^A-Za-z0-9]+/g,' ')
    .replace(/\s+/g,' ').trim().toLowerCase();
}
function containsPhrase(haystack,phrase){
  if(!phrase||phrase.length<3) return false;
  return (` ${haystack} `).includes(` ${phrase} `);
}
function actorVariants(name){
  const parts=norm(name).split(' ').filter(Boolean);
  const out=[parts.join(' ')];
  if(parts.length>=2){
    const last=parts[parts.length-1];
    const given=parts.slice(0,-1);
    out.push([last,...given].join(' '));
    if(parts[0].length>=3&&last.length>=3) out.push(`${last} ${parts[0]}`);
  }
  return uniq(out);
}
function teamAliases(team){
  return uniq([team.name,team.short_name,team.party_name,team.party_slug]
    .map(x=>String(x??'').trim()).filter(x=>x.length>=4));
}
function exactTeamMention(text,alias){
  if(!alias) return false;
  const escaped=alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const oneWord=!/\s/.test(alias.trim());
  if(oneWord){
    const re=new RegExp(`(^|[^A-Za-z])${escaped}([^A-Za-z]|$)`);
    return re.test(text);
  }
  return containsPhrase(norm(text),norm(alias));
}

const rosterByJurisdiction=new Map();
const teamsByJurisdiction=new Map();
const ensure=id=>{
  if(!rosterByJurisdiction.has(id)) rosterByJurisdiction.set(id,[]);
  if(!teamsByJurisdiction.has(id)) teamsByJurisdiction.set(id,[]);
};
const addPlayer=(jurisdiction,actor)=>{
  if(!jurisdiction||!actor?.actor_id||!actor?.name) return;
  ensure(jurisdiction);
  rosterByJurisdiction.get(jurisdiction).push({actor_id:actor.actor_id,name:actor.name,party_id:actor.party_id??null});
};
const addTeam=(jurisdiction,team)=>{
  if(!jurisdiction||!team?.party_id) return;
  ensure(jurisdiction);
  teamsByJurisdiction.get(jurisdiction).push({party_id:team.party_id,name:team.name||null,short_name:team.short_name||null,party_slug:team.party_slug||null});
};

if(exists('data/runtime/federal-parliamentary-players.json')){
  const fed=read('data/runtime/federal-parliamentary-players.json');
  for(const actor of fed.players||[]) addPlayer('AUS-FED',actor);
}
if(exists('data/runtime/party-rosters.json')){
  const teams=read('data/runtime/party-rosters.json');
  for(const team of teams.parties||[]) addTeam('AUS-FED',team);
}

const compactFiles={
  'AUS-NSW':'data/runtime/new-south-wales-parliamentary-players.json',
  'AUS-VIC':'data/runtime/victoria-parliamentary-players.json',
  'AUS-QLD':'data/runtime/queensland-parliamentary-players.json',
  'AUS-WA':'data/runtime/western-australia-parliamentary-players.json',
  'AUS-SA':'data/runtime/south-australia-parliamentary-players.json',
  'AUS-TAS':'data/runtime/tasmania-parliamentary-players.json'
};
for(const [jurisdiction,file] of Object.entries(compactFiles)){
  if(!exists(file)) continue;
  const data=read(file);
  const fields=data.player_fields||[];
  const idx=Object.fromEntries(fields.map((field,i)=>[field,i]));
  const partyMap=data.party_map||{};
  for(const row of data.players||[]){
    const abbr=idx.party_abbreviation>=0?row[idx.party_abbreviation]:null;
    addPlayer(jurisdiction,{
      actor_id:row[idx.actor_id],
      name:row[idx.name],
      party_id:abbr&&partyMap[abbr]?partyMap[abbr].party_id:null
    });
  }
  for(const team of data.teams||[]) addTeam(jurisdiction,team);
}

if(exists('data/runtime/state-territory-parliamentary-players.json')){
  const base=read('data/runtime/state-territory-parliamentary-players.json');
  for(const jurisdiction of base.jurisdictions||[]){
    const id=jurisdiction.competition_id||jurisdiction.jurisdiction_id;
    for(const actor of jurisdiction.players||[]) addPlayer(id,actor);
    for(const team of jurisdiction.teams||[]) addTeam(id,team);
  }
}

for(const [jurisdiction,players] of rosterByJurisdiction){
  const variantOwners=new Map();
  for(const actor of players){
    actor.variants=actorVariants(actor.name);
    for(const variant of actor.variants){
      if(!variantOwners.has(variant)) variantOwners.set(variant,[]);
      variantOwners.get(variant).push(actor.actor_id);
    }
  }
  for(const actor of players) actor.variants=actor.variants.filter(v=>(variantOwners.get(v)||[]).length===1);
}

const details=read(DETAILS);
const detailByVersion=new Map((details.records||[]).map(x=>[x.detail_version_id,x]));
const ledger=read(AREAS);
ledger.records ||= [];
const resolvedAt=new Date().toISOString();
let resolvedRows=0,actorsResolved=0,teamsResolved=0;

for(const row of ledger.records){
  if(row.routing_state!=='SUBSTANTIVE_CONTENT_ROUTED') continue;
  const detail=detailByVersion.get(row.detail_version_id);
  if(!detail) continue;
  const text=String(detail.body_text||'');
  const normalized=norm(text);
  const actors=[];
  for(const actor of rosterByJurisdiction.get(row.jurisdiction_id)||[]){
    const matched=actor.variants.find(variant=>containsPhrase(normalized,variant));
    if(matched) actors.push({actor_id:actor.actor_id,name:actor.name,match_variant:matched,party_id_at_resolution:actor.party_id});
  }
  const teams=[];
  for(const team of teamsByJurisdiction.get(row.jurisdiction_id)||[]){
    const alias=teamAliases(team).find(candidate=>exactTeamMention(text,candidate));
    if(alias) teams.push({party_id:team.party_id,name:team.name||team.short_name||alias,match_alias:alias});
  }
  row.source_party_id=row.party_id??row.source_party_id??null;
  row.actor_ids=uniq(actors.map(x=>x.actor_id));
  row.party_ids=uniq(teams.map(x=>x.party_id));
  row.entity_mentions={actors,teams};
  row.entity_resolution_state=actors.length||teams.length?'RESOLVED_EXPLICIT_CANONICAL_MENTIONS':'NO_CANONICAL_ENTITY_MENTION_RESOLVED';
  row.entity_resolved_at=resolvedAt;
  row.entity_resolution_history=Array.isArray(row.entity_resolution_history)?row.entity_resolution_history:[];
  const last=row.entity_resolution_history[row.entity_resolution_history.length-1];
  const signature=JSON.stringify({actors:row.actor_ids,teams:row.party_ids,state:row.entity_resolution_state});
  if(last?.signature!==signature) row.entity_resolution_history.push({at:resolvedAt,signature,state:row.entity_resolution_state,actor_ids:row.actor_ids,party_ids:row.party_ids});
  row.integrity={...(row.integrity||{}),entity_resolution_exact_jurisdiction_roster_only:true,actor_affiliation_not_treated_as_explicit_team_mention:true,entity_mention_does_not_establish_position:true};
  resolvedRows++;actorsResolved+=actors.length;teamsResolved+=teams.length;
}

ledger.updated_at=resolvedAt;
ledger.entity_resolution_summary={active_rows_examined:resolvedRows,actor_mentions_resolved:actorsResolved,team_mentions_resolved:teamsResolved,jurisdictions_with_rosters:[...rosterByJurisdiction.keys()].sort()};
write(AREAS,ledger);
console.log('POLITICAL_MAYHEM_ENTITY_RESOLUTION_OK',`rows=${resolvedRows}`,`actors=${actorsResolved}`,`teams=${teamsResolved}`,`jurisdictions=${rosterByJurisdiction.size}`);
