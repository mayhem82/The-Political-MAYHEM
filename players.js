const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

Promise.all([
  fetch('data/runtime/federal-parliamentary-players.json?'+Date.now(),{cache:'no-store'}).then(r=>r.json()),
  fetch('data/runtime/party-rosters.json?'+Date.now(),{cache:'no-store'}).then(r=>r.json()),
  fetch('data/runtime/state-territory-parliamentary-players.json?'+Date.now(),{cache:'no-store'}).then(r=>r.json()),
  fetch('data/runtime/queensland-parliamentary-players.json?'+Date.now(),{cache:'no-store'}).then(r=>r.json()),
  fetch('data/runtime/western-australia-parliamentary-players.json?'+Date.now(),{cache:'no-store'}).then(r=>r.json()),
  fetch('data/runtime/political-competitions.json?'+Date.now(),{cache:'no-store'}).then(r=>r.json())
]).then(([fed,fedRosters,st,qld,wa,competitions])=>{
  const fedTeams=new Map((fedRosters.parties||[]).map(t=>[t.party_id,t.short_name]));
  const qldPlayers=(qld.players||[]).map(r=>{const m=qld.party_map[r[3]]||{};return{actor_id:r[0],name:r[1],electorate:r[2],party_abbreviation:r[3],party_id:m.party_id??null,team_name:m.short_name||m.name||'Independent',chamber:'LEGISLATIVE_ASSEMBLY',role:`Member for ${r[2]}`,status:'ACTIVE'}});
  const waPlayers=(wa.players||[]).map(r=>{const m=wa.party_map[r[4]]||{};return{actor_id:r[0],name:r[1],chamber:r[2],electorate:r[3],party_abbreviation:r[4],party_id:m.party_id??null,team_name:m.short_name||m.name||'Independent',role:r[2]==='LEGISLATIVE_COUNCIL'?'Member of the Legislative Council':`Member for ${r[3]}`,status:'ACTIVE'}});
  const fields=[
    {id:'AUS-FED',label:'Federal Finals',players:(fed.players||[]).map(p=>({...p,electorate:p.division,team_name:fedTeams.get(p.party_id)||'Independent'})),teams:(fedRosters.parties||[]).map(t=>({party_id:t.party_id,name:t.short_name,player_count:t.player_count})),independents:fed.counts.independents},
    {id:'AUS-QLD',label:'Queensland',players:qldPlayers,teams:(qld.teams||[]).map(t=>({party_id:t.party_id,name:t.short_name||t.name,player_count:t.player_count})),independents:qld.counts.independents},
    {id:'AUS-WA',label:'Western Australia',players:waPlayers,teams:(wa.teams||[]).map(t=>({party_id:t.party_id,name:t.short_name||t.name,player_count:t.player_count})),independents:wa.counts.independents},
    ...(st.jurisdictions||[]).map(j=>{const teamMap=new Map((j.teams||[]).map(t=>[t.party_id,t.name]));return{id:j.competition_id,label:j.jurisdiction==='Australian Capital Territory'?'ACT':j.jurisdiction,players:(j.players||[]).map(p=>({...p,team_name:teamMap.get(p.party_id)||'Independent'})),teams:j.teams||[],independents:j.counts.independents}})
  ];
  const order=['AUS-FED','AUS-QLD','AUS-WA','AUS-ACT','AUS-NT'];
  fields.sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));

  const jurisdiction=document.getElementById('player-jurisdiction');
  const search=document.getElementById('player-search');
  const team=document.getElementById('player-team');
  const chamber=document.getElementById('player-chamber');
  const host=document.getElementById('player-list');

  jurisdiction.innerHTML=fields.map(f=>`<option value="${esc(f.id)}">${esc(f.label)} · ${f.players.length} players</option>`).join('');
  const requested=new URLSearchParams(location.search).get('jurisdiction');
  if(fields.some(f=>f.id===requested))jurisdiction.value=requested;

  const draw=()=>{
    const field=fields.find(f=>f.id===jurisdiction.value)||fields[0];
    const q=search.value.trim().toLowerCase();
    const tv=team.value;
    const cv=chamber.value;
    const visible=field.players.filter(p=>(!q||[p.name,p.role,p.electorate,p.team_name,p.chamber].some(v=>String(v||'').toLowerCase().includes(q)))&&(!tv||(tv==='INDEPENDENT'?!p.party_id:p.party_id===tv))&&(!cv||p.chamber===cv));
    document.getElementById('player-count').textContent=`${visible.length} of ${field.players.length} ${field.label} players shown`;
    host.innerHTML=visible.map(p=>`<article class="directory-row"><div><span class="player-label">PLAYER · ${esc(String(p.chamber||'').replaceAll('_',' '))}</span><b>${esc(p.name)}</b><small>${esc(p.role||'')}</small></div><div class="directory-meta"><strong>${esc(p.team_name)}</strong><span>${esc(p.electorate||p.state||'')}</span></div></article>`).join('')||'<div class="empty-state">No players match these filters.</div>';
    history.replaceState(null,'',`${location.pathname}?jurisdiction=${encodeURIComponent(field.id)}`);
  };

  const rebuild=()=>{
    const field=fields.find(f=>f.id===jurisdiction.value)||fields[0];
    team.innerHTML='<option value="">All teams + independents</option>'+field.teams.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(t=>`<option value="${esc(t.party_id)}">${esc(t.name)} · ${t.player_count} players</option>`).join('')+`<option value="INDEPENDENT">Independent · ${field.independents} players</option>`;
    const chambers=[...new Set(field.players.map(p=>p.chamber).filter(Boolean))].sort();
    chamber.innerHTML='<option value="">All chambers</option>'+chambers.map(c=>`<option value="${esc(c)}">${esc(String(c).replaceAll('_',' '))}</option>`).join('');
    draw();
  };

  jurisdiction.addEventListener('change',rebuild);
  search.addEventListener('input',draw);
  team.addEventListener('change',draw);
  chamber.addEventListener('change',draw);
  const progress=competitions.ingestion_progress||{};
  document.getElementById('player-meta').textContent=`${fields.reduce((n,f)=>n+f.players.length,0)} parliamentary players ingested across Federal Finals, Queensland, Western Australia, ACT and Northern Territory · ${progress.remaining_jurisdictions?.length||0} state competitions still roster-pending · ${wa.snapshot_id}`;
  rebuild();
}).catch(()=>document.getElementById('player-list').innerHTML='<div class="empty-state">Parliamentary player feeds unavailable.</div>');
