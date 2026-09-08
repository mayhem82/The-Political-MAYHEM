import fs from 'node:fs';

const OUT='data/runtime/player-finals-history.json';
const PLAYERS='data/runtime/federal-parliamentary-players.json';
const ARCHIVE='https://results.aec.gov.au/';
const UA='Political-MAYHEM/1.0 (+https://github.com/mayhem82/The-Political-MAYHEM)';

const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const tokens=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).filter(Boolean);
const state=s=>String(s??'').toUpperCase();
const yearOf=s=>Number((String(s??'').match(/\b(19|20)\d{2}\b/)||[])[0]||0);

function parseCsv(text){
  const lines=String(text).replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean);
  const start=lines.findIndex(line=>/StateAb|DivisionNm|CandidateID|Surname|GivenNm/.test(line));
  if(start<0) throw new Error('CSV header not found');
  const parseLine=line=>{const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){cur+='"';i++;}else q=!q;}else if(c===','&&!q){out.push(cur);cur='';}else cur+=c;}out.push(cur);return out};
  const header=parseLine(lines[start]);
  return lines.slice(start+1).map(parseLine).filter(r=>r.length>=header.length).map(r=>Object.fromEntries(header.map((h,i)=>[h,r[i]??''])));
}

async function getText(url){
  const r=await fetch(url,{headers:{'user-agent':UA,'accept':'text/html,text/csv,text/plain,*/*'}});
  if(!r.ok) throw new Error(`${r.status} ${url}`);
  return await r.text();
}

async function firstCsv(urls){
  const errors=[];
  for(const url of urls){
    try{return {url,text:await getText(url)}}catch(e){errors.push(e.message)}
  }
  throw new Error(errors.join(' | '));
}

function candidateUrls(id,kind){
  const file=kind==='HOUSE'?`HouseCandidatesDownload-${id}.csv`:`SenateCandidatesDownload-${id}.csv`;
  return [
    `${ARCHIVE}${id}/Website/Downloads/${file}`,
    `${ARCHIVE}${id}/results/Downloads/${file}`,
    `${ARCHIVE}${id}/Website/${file}`
  ];
}
function senateElectedUrls(id){
  const file=`SenateSenatorsElectedDownload-${id}.csv`;
  return [
    `${ARCHIVE}${id}/Website/Downloads/${file}`,
    `${ARCHIVE}${id}/results/Downloads/${file}`,
    `${ARCHIVE}${id}/Website/${file}`
  ];
}

function nameMatches(player,row){
  const p=tokens(player.name),g=tokens(row.GivenNm||row.GivenName||row.FirstName),s=tokens(row.Surname||row.LastName);
  if(!p.length||!g.length||!s.length) return false;
  const surnameMatch=s.every((x,i)=>p[p.length-s.length+i]===x);
  return surnameMatch && p[0][0]===g[0][0] && (p[0]===g[0] || p[0].startsWith(g[0]) || g[0].startsWith(p[0]));
}

function uniquePlayerMatch(players,row){
  const matches=players.filter(p=>nameMatches(p,row));
  return matches.length===1?matches[0]:null;
}

function parseArchiveEvents(html){
  const out=[];
  const re=/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for(const m of html.matchAll(re)){
    const label=String(m[2]).replace(/<[^>]+>/g,' ').replace(/&[^;]+;/g,' ').replace(/\s+/g,' ').trim();
    if(!/(federal election|by-election|WA Senate election)/i.test(label)) continue;
    const id=(m[1].match(/\/(\d+)\//)||[])[1];
    const year=yearOf(label);
    if(!id||!year) continue;
    out.push({id,label,year,type:/by-election/i.test(label)?'BY_ELECTION':/WA Senate election/i.test(label)?'SENATE_RE_RUN':'GENERAL'});
  }
  const unique=new Map();for(const e of out)unique.set(`${e.id}|${e.label}`,e);
  return [...unique.values()].sort((a,b)=>a.year-b.year||a.label.localeCompare(b.label));
}

const playersDoc=JSON.parse(fs.readFileSync(PLAYERS,'utf8'));
const allPlayers=playersDoc.players||[];
const ledger=JSON.parse(fs.readFileSync(OUT,'utf8'));
const archiveHtml=await getText(ARCHIVE);
const events=parseArchiveEvents(archiveHtml).filter(e=>e.year>=2001);
if(!events.length) throw new Error('AEC archive event discovery returned zero elections');

const entries=[];
const acquisition=[];
const ambiguities=[];

for(const evt of events){
  let house=null;
  if(evt.type!=='SENATE_RE_RUN'){
    try{
      const fetched=await firstCsv(candidateUrls(evt.id,'HOUSE'));
      const rows=parseCsv(fetched.text);
      for(const row of rows){
        const p=uniquePlayerMatch(allPlayers,row);if(!p)continue;
        const elected=String(row.Elected||row.Status||'').toUpperCase();
        const result=(elected==='Y'||elected.includes('ELECTED'))?'WIN':'LOSS';
        entries.push({
          actor_id:p.actor_id,
          player_name:p.name,
          jurisdiction_id:'AUS-FED',
          chamber:'HOUSE',
          event:evt.label,
          event_year:evt.year,
          event_id:evt.id,
          contest_scope:row.DivisionNm||row.DivisionName||row.StateAb||'Federal House',
          team_at_event:row.PartyNm||row.PartyName||row.PartyAb||'Independent',
          team_code_at_event:row.PartyAb||null,
          result,
          source_class:'PRIMARY_ELECTORAL_AUTHORITY',
          source_refs:[fetched.url]
        });
      }
      house={state:'ACQUIRED',source:fetched.url,rows:rows.length};
    }catch(e){house={state:'FAILED',error:e.message}}
  }

  let senate=null;
  if(evt.type!=='BY_ELECTION'){
    try{
      const [cand,elected]=await Promise.all([firstCsv(candidateUrls(evt.id,'SENATE')),firstCsv(senateElectedUrls(evt.id))]);
      const candidates=parseCsv(cand.text), winners=parseCsv(elected.text);
      const winnerKeys=new Set(winners.map(r=>`${state(r.StateAb)}|${norm(r.Surname)}|${tokens(r.GivenNm)[0]?.[0]||''}`));
      for(const row of candidates){
        const p=uniquePlayerMatch(allPlayers,row);if(!p)continue;
        const key=`${state(row.StateAb)}|${norm(row.Surname)}|${tokens(row.GivenNm)[0]?.[0]||''}`;
        entries.push({
          actor_id:p.actor_id,
          player_name:p.name,
          jurisdiction_id:'AUS-FED',
          chamber:'SENATE',
          event:evt.label,
          event_year:evt.year,
          event_id:evt.id,
          contest_scope:`${state(row.StateAb)||state(p.state)||'AU'} Senate`,
          team_at_event:row.PartyNm||row.PartyName||row.PartyAb||row.GroupNm||'Independent',
          team_code_at_event:row.PartyAb||row.GroupAb||null,
          result:winnerKeys.has(key)?'WIN':'LOSS',
          source_class:'PRIMARY_ELECTORAL_AUTHORITY',
          source_refs:[cand.url,elected.url]
        });
      }
      senate={state:'ACQUIRED',candidate_source:cand.url,elected_source:elected.url,candidates:candidates.length,winners:winners.length};
    }catch(e){senate={state:'FAILED',error:e.message}}
  }
  acquisition.push({event:evt.label,event_id:evt.id,event_year:evt.year,type:evt.type,house,senate});
}

const dedup=new Map();
for(const e of entries){
  const key=`${e.actor_id}|${e.jurisdiction_id}|${e.chamber}|${e.event_id}|${e.contest_scope}`;
  if(dedup.has(key)){
    const prior=dedup.get(key);
    if(prior.result!==e.result||prior.team_at_event!==e.team_at_event) ambiguities.push({key,prior,e});
    continue;
  }
  dedup.set(key,e);
}
if(ambiguities.length) throw new Error(`Conflicting duplicate finals records: ${ambiguities.length}`);

const federalEntries=[...dedup.values()].sort((a,b)=>a.actor_id.localeCompare(b.actor_id)||a.event_year-b.event_year||a.event.localeCompare(b.event));
const playersWithHistory=new Set(federalEntries.map(e=>e.actor_id));
const failedEvents=acquisition.filter(a=>a.house?.state==='FAILED'||a.senate?.state==='FAILED');
const earliest=Math.min(...acquisition.map(a=>a.event_year));
const latest=Math.max(...acquisition.map(a=>a.event_year));

ledger.entries=[...(ledger.entries||[]).filter(e=>e.jurisdiction_id!=='AUS-FED'),...federalEntries];
ledger.coverage['AUS-FED']={
  state:failedEvents.length?'OFFICIAL_ARCHIVE_PARTIAL':'OFFICIAL_ARCHIVE_2001_PLUS_ACQUIRED',
  career_totals_authorised:false,
  source_authority:'Australian Electoral Commission',
  archive_url:ARCHIVE,
  event_year_start:earliest,
  event_year_end:latest,
  events_examined:acquisition.length,
  events_with_acquisition_failure:failedEvents.length,
  current_players_with_history:playersWithHistory.size,
  current_players_total:allPlayers.length,
  note:'Career totals remain unauthorised until pre-2001 federal candidacies and any unresolved archive acquisition gaps are reconciled.'
};
ledger.federal_backfill={captured_at:new Date().toISOString(),acquisition};
ledger.status='HISTORICAL_BACKFILL_IN_PROGRESS';
fs.writeFileSync(OUT,JSON.stringify(ledger,null,2)+'\n');
console.log(`FEDERAL_PLAYER_FINALS_BACKFILL entries=${federalEntries.length} players=${playersWithHistory.size}/${allPlayers.length} events=${acquisition.length} failures=${failedEvents.length}`);
