const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const words=s=>String(s??'UNKNOWN').replaceAll('_',' ');
const chamberLabel=c=>words(c||'UNKNOWN');

Promise.all([
  'federal-parliamentary-players.json','party-rosters.json','state-territory-parliamentary-players.json','queensland-parliamentary-players.json','western-australia-parliamentary-players.json','new-south-wales-parliamentary-players.json','victoria-parliamentary-players.json','south-australia-parliamentary-players.json','tasmania-parliamentary-players.json','political-competitions.json','team-player-form.json','intelligence-events.json'
].map(f=>fetch('data/runtime/'+f+'?'+Date.now(),{cache:'no-store'}).then(r=>{if(!r.ok)throw Error(f);return r.json()}))).then(([fed,fedRosters,st,qld,wa,nsw,vic,sa,tas,competitions,form,intel])=>{
  const fedTeams=new Map((fedRosters.parties||[]).map(t=>[t.party_id,t.short_name]));
  const playerForm=new Map((form.player_form||[]).map(x=>[x.actor_id,x]));
  const events=intel.events||[];
  const eventsByPlayer=new Map();
  for(const e of events){if(!e.actor_id)continue;const k=`${e.jurisdiction_id}|${e.actor_id}`;if(!eventsByPlayer.has(k))eventsByPlayer.set(k,[]);eventsByPlayer.get(k).push(e)}

  const compactField=(data,label)=>{
    const ix=Object.fromEntries((data.player_fields||[]).map((f,i)=>[f,i]));
    const players=(data.players||[]).map(r=>{const abbr=r[ix.party_abbreviation],m=data.party_map?.[abbr]||{},chamber=ix.chamber==null?(data.chamber||'LEGISLATIVE_ASSEMBLY'):r[ix.chamber],electorate=r[ix.electorate];return{actor_id:r[ix.actor_id],name:r[ix.name],chamber,electorate,party_abbreviation:abbr,party_id:m.party_id??null,team_name:m.short_name||m.name||'Independent',role:chamber==='LEGISLATIVE_COUNCIL'?'Member of the Legislative Council':`Member for ${electorate}`,status:'ACTIVE'}});
    return{id:data.competition_id,label,chamber_model:data.chamber_model,players,teams:(data.teams||[]).map(t=>({party_id:t.party_id,name:t.short_name||t.name,player_count:t.player_count})),independents:data.counts.independents};
  };
  const fields=[
    {id:'AUS-FED',label:'Federal Finals',chamber_model:'BICAMERAL',players:(fed.players||[]).map(p=>({...p,electorate:p.division,team_name:fedTeams.get(p.party_id)||'Independent'})),teams:(fedRosters.parties||[]).map(t=>({party_id:t.party_id,name:t.short_name,player_count:t.player_count})),independents:fed.counts.independents},
    compactField(nsw,'NSW'),compactField(vic,'Victoria'),compactField(qld,'Queensland'),compactField(wa,'Western Australia'),compactField(sa,'South Australia'),compactField(tas,'Tasmania'),
    ...(st.jurisdictions||[]).map(j=>{const teamMap=new Map((j.teams||[]).map(t=>[t.party_id,t.name]));return{id:j.competition_id,label:j.jurisdiction==='Australian Capital Territory'?'ACT':j.jurisdiction,chamber_model:j.chamber_model,players:(j.players||[]).map(p=>({...p,team_name:teamMap.get(p.party_id)||'Independent'})),teams:j.teams||[],independents:j.counts.independents}})
  ];
  const order=['AUS-FED','AUS-NSW','AUS-VIC','AUS-QLD','AUS-WA','AUS-SA','AUS-TAS','AUS-ACT','AUS-NT'];fields.sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));

  const jurisdiction=document.getElementById('player-jurisdiction'),search=document.getElementById('player-search'),team=document.getElementById('player-team'),chamber=document.getElementById('player-chamber'),host=document.getElementById('player-list'),statsHost=document.getElementById('player-stats'),statsTitle=document.getElementById('player-stats-title');
  jurisdiction.innerHTML=fields.map(f=>`<option value="${esc(f.id)}">${esc(f.label)} · ${f.players.length} players</option>`).join('');
  const requested=new URLSearchParams(location.search).get('jurisdiction');if(fields.some(f=>f.id===requested))jurisdiction.value=requested;

  const fieldStats=field=>{
    const partyPlayers=field.players.filter(p=>p.party_id).length;
    const chambers=[...new Set(field.players.map(p=>p.chamber).filter(Boolean))];
    const fieldEvents=events.filter(e=>e.jurisdiction_id===field.id);
    const playersWithIntel=new Set(fieldEvents.filter(e=>e.actor_id).map(e=>e.actor_id)).size;
    const chamberCounts=chambers.map(c=>({label:chamberLabel(c),value:field.players.filter(p=>p.chamber===c).length}));
    const stats=[
      {label:'TOTAL PLAYERS',value:field.players.length},
      {label:'PARTY PLAYERS',value:partyPlayers},
      {label:'INDEPENDENTS',value:field.independents},
      {label:'TEAMS',value:field.teams.length},
      {label:'PLAYERS WITH INTEL',value:playersWithIntel},
      {label:'LEDGER EVENTS',value:fieldEvents.length},
      ...chamberCounts,
      {label:'ROSTER COVERAGE',value:'100%'}
    ];
    statsTitle.textContent=`${field.label} player statistics`;
    statsHost.innerHTML=stats.map(x=>`<div class="player-stat"><small>${esc(x.label)}</small><strong>${esc(x.value)}</strong></div>`).join('');
  };

  const playerStats=(field,p)=>{
    const ev=eventsByPlayer.get(`${field.id}|${p.actor_id}`)||[];
    const pf=field.id==='AUS-FED'?playerForm.get(p.actor_id):null;
    const verified=ev.filter(e=>e.evidence_state==='VERIFIED').length;
    const sources=new Set(ev.map(e=>e.source_snapshot_id).filter(Boolean)).size;
    const targetEffects=ev.filter(e=>e.projection_effect&&e.projection_effect!=='NO_EFFECT').length;
    const roleChanges=ev.filter(e=>e.event_type==='ACTOR_STATE_CHANGED').length;
    return{events:ev.length,verified,sources,targetEffects,roleChanges,form:pf?.form_state||'NOT_YET_SCORED',trend:pf?.trend||'UNRESOLVED',contradictions:pf?.contradictions?.length??0,last:ev.slice().sort((a,b)=>String(b.event_date||'').localeCompare(String(a.event_date||'')))[0]||null};
  };

  const draw=()=>{
    const field=fields.find(f=>f.id===jurisdiction.value)||fields[0],q=search.value.trim().toLowerCase(),tv=team.value,cv=chamber.value;
    fieldStats(field);
    const visible=field.players.filter(p=>(!q||[p.name,p.role,p.electorate,p.team_name,p.chamber].some(v=>String(v||'').toLowerCase().includes(q)))&&(!tv||(tv==='INDEPENDENT'?!p.party_id:p.party_id===tv))&&(!cv||p.chamber===cv));
    document.getElementById('player-count').textContent=`${visible.length} of ${field.players.length} ${field.label} players shown`;
    host.innerHTML=visible.map(p=>{const s=playerStats(field,p),intelState=s.events?'INTELLIGENCE ACTIVE':'ROSTER ONLY';return`<article class="player-card"><div class="player-card-head"><div><span class="player-label">PLAYER · ${esc(chamberLabel(p.chamber))}</span><h3>${esc(p.name)}</h3><p>${esc(p.role||'')}</p></div><div class="directory-meta"><strong>${esc(p.team_name)}</strong><span>${esc(p.electorate||p.state||'')}</span><span class="player-state-pill">${esc(intelState)}</span></div></div><div class="player-card-stats"><div><small>LEDGER EVENTS</small><strong>${s.events}</strong></div><div><small>VERIFIED</small><strong>${s.verified}</strong></div><div><small>SOURCES</small><strong>${s.sources}</strong></div><div><small>ROLE CHANGES</small><strong>${s.roleChanges}</strong></div><div><small>TARGET EFFECTS</small><strong>${s.targetEffects}</strong></div><div><small>CONTRADICTIONS</small><strong>${s.contradictions}</strong></div></div><div class="player-form-line"><span><small>FORM</small><b>${esc(words(s.form))}</b></span><span><small>TREND</small><b>${esc(words(s.trend))}</b></span></div>${s.last?`<div class="player-evidence"><small>LATEST PLAYER EVIDENCE · ${esc(s.last.event_date||s.last.captured_at||'')}</small><p>${esc(s.last.claim||'')}</p></div>`:`<div class="player-evidence muted-evidence"><small>PLAYER EVIDENCE</small><p>No actor-specific forward intelligence event is registered yet. This is an absence from the current ledger, not a neutral performance rating.</p></div>`}</article>`}).join('')||'<div class="empty-state">No players match these filters.</div>';
    history.replaceState(null,'',`${location.pathname}?jurisdiction=${encodeURIComponent(field.id)}`)
  };

  const rebuild=()=>{const field=fields.find(f=>f.id===jurisdiction.value)||fields[0];team.innerHTML='<option value="">All teams + independents</option>'+field.teams.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(t=>`<option value="${esc(t.party_id)}">${esc(t.name)} · ${t.player_count} players</option>`).join('')+`<option value="INDEPENDENT">Independent · ${field.independents} players</option>`;const chambers=[...new Set(field.players.map(p=>p.chamber).filter(Boolean))].sort();chamber.innerHTML='<option value="">All chambers</option>'+chambers.map(c=>`<option value="${esc(c)}">${esc(chamberLabel(c))}</option>`).join('');draw()};
  jurisdiction.addEventListener('change',rebuild);search.addEventListener('input',draw);team.addEventListener('change',draw);chamber.addEventListener('change',draw);
  const progress=competitions.ingestion_progress||{};document.getElementById('player-meta').textContent=`${fields.reduce((n,f)=>n+f.players.length,0)} parliamentary players ingested across Federal Finals and all ${progress.state_territory_jurisdictions_with_complete_current_player_rosters||8} state/territory competitions · structural roster coverage complete · intelligence statistics accumulate only from the forward evidence ledger.`;
  rebuild();
}).catch(e=>{document.getElementById('player-list').innerHTML=`<div class="empty-state">Parliamentary player feeds unavailable: ${esc(e.message)}</div>`});
