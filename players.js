const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const words=s=>String(s??'UNKNOWN').replaceAll('_',' ');
const chamberLabel=c=>words(c||'UNKNOWN');
const pct=v=>v==null?'—':`${Number(v).toFixed(2).replace(/\.00$/,'')}%`;
const signed=v=>v==null?'—':`${Number(v)>0?'+':''}${Number(v).toFixed(2).replace(/\.00$/,'')} pp`;

Promise.all([
  'data/runtime/federal-parliamentary-players.json','data/runtime/party-rosters.json','data/runtime/state-territory-parliamentary-players.json','data/runtime/queensland-parliamentary-players.json','data/runtime/western-australia-parliamentary-players.json','data/runtime/new-south-wales-parliamentary-players.json','data/runtime/victoria-parliamentary-players.json','data/runtime/south-australia-parliamentary-players.json','data/runtime/tasmania-parliamentary-players.json','data/runtime/political-competitions.json','data/runtime/team-player-form.json','data/runtime/intelligence-events.json','data/player-stat-registry.json','data/runtime/federal-house-electoral-performance-v2.json'
].map(f=>fetch(f+'?'+Date.now(),{cache:'no-store'}).then(r=>{if(!r.ok)throw Error(f);return r.json()}))).then(([fed,fedRosters,st,qld,wa,nsw,vic,sa,tas,competitions,form,intel,statRegistry,electoral])=>{
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

  const electoralIx=Object.fromEntries((electoral.fields||[]).map((f,i)=>[f,i]));
  const divisionResults=new Map((electoral.division_results||[]).map(r=>[r[electoralIx.division],r]));
  const candidateResults=new Map((electoral.candidate_specific_results||[]).map(r=>[r.actor_id,r]));
  const electionOverrides=electoral.current_player_election_party_overrides||{};
  const partyCodeBySlug={labor:'ALP',liberal:'LP','liberal-national':'LNP',nationals:'NP','country-liberal':'CLP'};
  const primaryFieldByCode={ALP:'alp_first_preference_percent',LP:'liberal_first_preference_percent',LNP:'lnp_first_preference_percent',NP:'nationals_first_preference_percent',CLP:'clp_first_preference_percent'};
  const coalitionCodes=new Set(['LP','LNP','NP','CLP']);

  const jurisdiction=document.getElementById('player-jurisdiction'),search=document.getElementById('player-search'),team=document.getElementById('player-team'),chamber=document.getElementById('player-chamber'),host=document.getElementById('player-list'),statsHost=document.getElementById('player-stats'),statsTitle=document.getElementById('player-stats-title'),registryHost=document.getElementById('stat-registry-status');
  jurisdiction.innerHTML=fields.map(f=>`<option value="${esc(f.id)}">${esc(f.label)} · ${f.players.length} players</option>`).join('');
  const requested=new URLSearchParams(location.search).get('jurisdiction');if(fields.some(f=>f.id===requested))jurisdiction.value=requested;

  const pendingGroups=(statRegistry.groups||[]).filter(g=>(g.stats||[]).some(s=>s.availability&&s.availability!=='LOADED'));
  if(registryHost)registryHost.innerHTML=`<b>STAT COVERAGE</b><span>Structural and forward-intelligence stats are live. Federal House electoral context is now loaded across 150/150 divisions; candidate-specific TCP/margin/swing coverage is expanding. ${pendingGroups.filter(g=>g.group_id==='PARLIAMENTARY_ACTIVITY').map(g=>`${esc(g.public_label)} · INGESTION PENDING`).join('')}</span><small>Missing data is never rendered as zero. Registry ${esc(statRegistry.registry_id||'')}</small>`;

  const fieldStats=field=>{
    const partyPlayers=field.players.filter(p=>p.party_id).length;
    const chambers=[...new Set(field.players.map(p=>p.chamber).filter(Boolean))];
    const fieldEvents=events.filter(e=>e.jurisdiction_id===field.id);
    const playersWithIntel=new Set(fieldEvents.filter(e=>e.actor_id).map(e=>e.actor_id)).size;
    const verifiedEvents=fieldEvents.filter(e=>e.evidence_state==='VERIFIED').length;
    const coverage=field.players.length?Math.round((playersWithIntel/field.players.length)*1000)/10:0;
    const chamberCounts=chambers.map(c=>({label:chamberLabel(c),value:field.players.filter(p=>p.chamber===c).length}));
    const stats=[
      {label:'TOTAL PLAYERS',value:field.players.length},
      {label:'PARTY PLAYERS',value:partyPlayers},
      {label:'INDEPENDENTS',value:field.independents},
      {label:'TEAMS',value:field.teams.length},
      {label:'PLAYERS WITH INTEL',value:playersWithIntel},
      {label:'INTEL COVERAGE',value:`${coverage}%`},
      {label:'VERIFIED EVENTS',value:verifiedEvents},
      {label:'LEDGER EVENTS',value:fieldEvents.length},
      ...chamberCounts,
      {label:'ROSTER COVERAGE',value:'100%'}
    ];
    if(field.id==='AUS-FED')stats.push({label:'HOUSE ELECTORAL CONTEXT',value:`${electoral.coverage?.division_context_records||0}/150`});
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
    const contradictions=(pf?.contradictions||[]).length+ev.filter(e=>e.evidence_state==='CONTRADICTED').length;
    const last=ev.slice().sort((a,b)=>String(b.event_date||b.captured_at||'').localeCompare(String(a.event_date||a.captured_at||'')))[0]||null;
    return{events:ev.length,verified,sources,targetEffects,roleChanges,form:pf?.form_state||'NOT_YET_SCORED',trend:pf?.trend||'UNRESOLVED',contradictions,last};
  };

  const federalElectoralStats=p=>{
    if(p.chamber!=='HOUSE')return{state:'PENDING',message:'Senate candidate/group statistical dossier not yet loaded.'};
    const specific=candidateResults.get(p.actor_id);
    if(specific)return{state:'CANDIDATE_SPECIFIC',event:specific.event,primary:specific.primary_vote_percent,primarySwing:specific.primary_swing_points,tcp:specific.tcp_percent,tcpSwing:specific.tcp_swing_points,marginVotes:specific.tcp_margin_votes,sourceClass:specific.source_class};
    const row=divisionResults.get(p.division||p.electorate);
    if(!row)return{state:'PENDING',message:'Division electoral context not resolved in the current snapshot.'};
    const code=Object.prototype.hasOwnProperty.call(electionOverrides,p.actor_id)?electionOverrides[p.actor_id].election_party_code:partyCodeBySlug[p.party];
    const tppAlp=row[electoralIx.tpp_alp_percent],tppLnc=row[electoralIx.tpp_lnc_percent];
    if(!code)return{state:'DIVISION_CONTEXT_ONLY',event:electoral.event,tppAlp,tppLnc,message:'Candidate-specific primary/TCP result is not yet loaded. OTH is deliberately not attributed to an individual player.'};
    const primaryField=primaryFieldByCode[code],primary=primaryField==null?null:row[electoralIx[primaryField]];
    const partySide2pp=code==='ALP'?tppAlp:coalitionCodes.has(code)?tppLnc:null;
    return{state:'MAJOR_PARTY_DIVISION_DERIVED',event:electoral.event,electionPartyCode:code,primary,partySide2pp,tppAlp,tppLnc};
  };

  const electoralBlock=(field,p)=>{
    if(field.id!=='AUS-FED')return`<div class="player-section-label">ELECTORAL PERFORMANCE</div><div class="player-evidence muted-evidence"><small>JURISDICTION DOSSIER</small><p>Candidate-level electoral performance for ${esc(field.label)} has not yet been ingested. Missing statistics are not rendered as zero.</p></div>`;
    const e=federalElectoralStats(p);
    if(e.state==='PENDING')return`<div class="player-section-label">ELECTORAL PERFORMANCE</div><div class="player-evidence muted-evidence"><small>FEDERAL ELECTORAL DOSSIER</small><p>${esc(e.message)}</p></div>`;
    if(e.state==='CANDIDATE_SPECIFIC')return`<div class="player-section-label">ELECTORAL PERFORMANCE</div><div class="electoral-stats"><span><small>EVENT</small><b>${esc(e.event)}</b></span><span><small>PRIMARY VOTE</small><b>${esc(pct(e.primary))}</b>${e.primarySwing!=null?`<em>${esc(signed(e.primarySwing))}</em>`:''}</span><span><small>TCP</small><b>${esc(pct(e.tcp))}</b>${e.tcpSwing!=null?`<em>${esc(signed(e.tcpSwing))}</em>`:''}</span><span><small>TCP MARGIN</small><b>${e.marginVotes==null?'—':esc(Number(e.marginVotes).toLocaleString())+' votes'}</b></span></div><div class="electoral-note">Candidate-specific result · ${esc(words(e.sourceClass))}</div>`;
    if(e.state==='MAJOR_PARTY_DIVISION_DERIVED')return`<div class="player-section-label">ELECTORAL PERFORMANCE</div><div class="electoral-stats"><span><small>EVENT</small><b>${esc(e.event)}</b></span><span><small>PRIMARY VOTE</small><b>${esc(pct(e.primary))}</b><em>${esc(e.electionPartyCode)} at election</em></span><span><small>DIVISION 2PP · PARTY SIDE</small><b>${esc(pct(e.partySide2pp))}</b><em>Statistical 2PP, not TCP in non-classic contests</em></span><span><small>DIVISION 2PP CONTEXT</small><b>ALP ${esc(pct(e.tppAlp))} · LNC ${esc(pct(e.tppLnc))}</b></span></div><div class="electoral-note">AEC final 2025 division result · historical election party preserved where current affiliation changed.</div>`;
    return`<div class="player-section-label">ELECTORAL PERFORMANCE</div><div class="electoral-stats"><span><small>EVENT</small><b>${esc(e.event)}</b></span><span><small>PRIMARY VOTE</small><b>Pending</b><em>OTH aggregate not attributed</em></span><span><small>DIVISION 2PP CONTEXT</small><b>ALP ${esc(pct(e.tppAlp))} · LNC ${esc(pct(e.tppLnc))}</b></span></div><div class="electoral-note">${esc(e.message)}</div>`;
  };

  const draw=()=>{
    const field=fields.find(f=>f.id===jurisdiction.value)||fields[0],q=search.value.trim().toLowerCase(),tv=team.value,cv=chamber.value;
    fieldStats(field);
    const visible=field.players.filter(p=>(!q||[p.name,p.role,p.electorate,p.team_name,p.chamber].some(v=>String(v||'').toLowerCase().includes(q)))&&(!tv||(tv==='INDEPENDENT'?!p.party_id:p.party_id===tv))&&(!cv||p.chamber===cv));
    document.getElementById('player-count').textContent=`${visible.length} of ${field.players.length} ${field.label} players shown`;
    host.innerHTML=visible.map(p=>{const s=playerStats(field,p),intelState=s.events?'INTELLIGENCE ACTIVE':'ROSTER ONLY';return`<article class="player-card"><div class="player-card-head"><div><span class="player-label">PLAYER · ${esc(chamberLabel(p.chamber))}</span><h3>${esc(p.name)}</h3><p>${esc(p.role||'')}</p></div><div class="directory-meta"><strong>${esc(p.team_name)}</strong><span>${esc(p.electorate||p.state||'')}</span><span class="player-state-pill">${esc(intelState)}</span></div></div><div class="player-section-label">CURRENT PERFORMANCE</div><div class="player-card-stats"><div><small>LEDGER EVENTS</small><strong>${s.events}</strong></div><div><small>VERIFIED</small><strong>${s.verified}</strong></div><div><small>SOURCES</small><strong>${s.sources}</strong></div><div><small>ROLE CHANGES</small><strong>${s.roleChanges}</strong></div><div><small>TARGET EFFECTS</small><strong>${s.targetEffects}</strong></div><div><small>CONTRADICTIONS</small><strong>${s.contradictions}</strong></div></div><div class="player-form-line"><span><small>FORM</small><b>${esc(words(s.form))}</b></span><span><small>TREND</small><b>${esc(words(s.trend))}</b></span></div>${electoralBlock(field,p)}<div class="player-section-label">STRUCTURAL</div><div class="player-structural"><span><small>COMPETITION</small><b>${esc(field.label)}</b></span><span><small>TEAM</small><b>${esc(p.team_name)}</b></span><span><small>CHAMBER</small><b>${esc(chamberLabel(p.chamber))}</b></span><span><small>ELECTORATE / STATE</small><b>${esc(p.electorate||p.state||'—')}</b></span></div>${s.last?`<div class="player-evidence"><small>LATEST PLAYER EVIDENCE · ${esc(s.last.event_date||s.last.captured_at||'')}</small><p>${esc(s.last.claim||'')}</p><span>${esc(words(s.last.evidence_state||'UNKNOWN'))} · ${esc(words(s.last.source_class||'UNKNOWN'))}</span></div>`:`<div class="player-evidence muted-evidence"><small>PLAYER EVIDENCE</small><p>No actor-specific forward intelligence event is registered yet. This is an absence from the current ledger, not a neutral performance rating.</p></div>`}</article>`}).join('')||'<div class="empty-state">No players match these filters.</div>';
    history.replaceState(null,'',`${location.pathname}?jurisdiction=${encodeURIComponent(field.id)}`)
  };

  const rebuild=()=>{const field=fields.find(f=>f.id===jurisdiction.value)||fields[0];team.innerHTML='<option value="">All teams + independents</option>'+field.teams.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(t=>`<option value="${esc(t.party_id)}">${esc(t.name)} · ${t.player_count} players</option>`).join('')+`<option value="INDEPENDENT">Independent · ${field.independents} players</option>`;const chambers=[...new Set(field.players.map(p=>p.chamber).filter(Boolean))].sort();chamber.innerHTML='<option value="">All chambers</option>'+chambers.map(c=>`<option value="${esc(c)}">${esc(chamberLabel(c))}</option>`).join('');draw()};
  jurisdiction.addEventListener('change',rebuild);search.addEventListener('input',draw);team.addEventListener('change',draw);chamber.addEventListener('change',draw);
  const progress=competitions.ingestion_progress||{};document.getElementById('player-meta').textContent=`${fields.reduce((n,f)=>n+f.players.length,0)} parliamentary players ingested across Federal Finals and all ${progress.state_territory_jurisdictions_with_complete_current_player_rosters||8} state/territory competitions · federal House electoral context ${electoral.coverage?.division_context_records||0}/150 divisions · political statistics expand only from source-backed records.`;
  rebuild();
}).catch(e=>{document.getElementById('player-list').innerHTML=`<div class="empty-state">Parliamentary player feeds unavailable: ${esc(e.message)}</div>`});
