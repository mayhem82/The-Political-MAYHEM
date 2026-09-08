import fs from 'node:fs';

const FILE='data/runtime/player-finals-history.json';
const data=JSON.parse(fs.readFileSync(FILE,'utf8'));
const requiredFields=['actor_id','jurisdiction_id','event','event_year','contest_scope','team_at_event','result','source_refs'];
const validResults=new Set(['WIN','LOSS']);
const validFields=new Set(['AUS-FED','AUS-NSW','AUS-VIC','AUS-QLD','AUS-WA','AUS-SA','AUS-TAS','AUS-ACT','AUS-NT']);

if(data.rules?.missing_history_is_not_zero!==true) throw new Error('missing history must not become zero');
if(data.rules?.career_total_requires_complete_player_history!==true) throw new Error('career total must require complete player history');
if(data.rules?.election_day_team_is_immutable!==true) throw new Error('election-day team must be immutable');
if(data.rules?.retrospective_discovery_is_valid_evidence!==true) throw new Error('retrospective discovery must remain valid evidence');

for(const id of validFields){
  const c=data.coverage?.[id];
  if(!c) throw new Error(`missing coverage state for ${id}`);
  if(c.career_totals_authorised===true && c.state!=='COMPLETE') throw new Error(`${id}: career totals authorised before complete history`);
}

const seen=new Set();
for(const [i,e] of (data.entries||[]).entries()){
  for(const k of requiredFields) if(e[k]==null || (Array.isArray(e[k])&&e[k].length===0)) throw new Error(`entry ${i}: missing ${k}`);
  if(!validFields.has(e.jurisdiction_id)) throw new Error(`entry ${i}: invalid jurisdiction ${e.jurisdiction_id}`);
  if(!Number.isInteger(Number(e.event_year)) || Number(e.event_year)<1901) throw new Error(`entry ${i}: invalid event_year`);
  if(!validResults.has(e.result)) throw new Error(`entry ${i}: invalid result ${e.result}`);
  if(!Array.isArray(e.source_refs)||!e.source_refs.length) throw new Error(`entry ${i}: source lineage required`);
  const key=`${e.actor_id}|${e.jurisdiction_id}|${e.event}|${e.contest_scope}`;
  if(seen.has(key)) throw new Error(`duplicate finals entry ${key}`);
  seen.add(key);
}

console.log(`PLAYER_FINALS_HISTORY_OK entries=${(data.entries||[]).length} fields=${Object.keys(data.coverage||{}).length}`);
