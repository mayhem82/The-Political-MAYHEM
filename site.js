const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const words=s=>String(s??'UNKNOWN').replaceAll('_',' ');

async function loadTeamIntelligence(){
  const select=document.getElementById('team-select');
  const view=document.getElementById('team-view');
  if(!select||!view)return;

  try{
    const [rosterRes,formRes,depthRes]=await Promise.all([
      fetch('data/runtime/party-rosters.json?'+Date.now(),{cache:'no-store'}),
      fetch('data/runtime/team-player-form.json?'+Date.now(),{cache:'no-store'}),
      fetch('data/runtime/team-squad-depth.json?'+Date.now(),{cache:'no-store'})
    ]);
    if(!rosterRes.ok)throw new Error(`Roster HTTP ${rosterRes.status}`);
    if(!formRes.ok)throw new Error(`Form HTTP ${formRes.status}`);
    if(!depthRes.ok)throw new Error(`Squad depth HTTP ${depthRes.status}`);

    const roster=await rosterRes.json();
    const form=await formRes.json();
    const depth=await depthRes.json();
    const teams=(roster.parties||[]).slice().sort((a,b)=>a.short_name.localeCompare(b.short_name));
    const formByTeam=new Map((form.team_form||[]).map(x=>[x.party_id,x]));
    const depthByTeam=new Map((depth.teams||[]).map(x=>[x.party_id,x]));

    select.innerHTML=teams.map(t=>`<option value="${esc(t.party_id)}">${esc(t.short_name)} · ${t.player_count??(t.actors||[]).length} players</option>`).join('');

    const requested=new URLSearchParams(location.search).get('team');
    const requestedTeam=teams.find(t=>t.party_id===requested||t.short_name.toLowerCase()===String(requested||'').toLowerCase());
    if(requestedTeam)select.value=requestedTeam.party_id;

    const render=()=>{
      const party=teams.find(t=>t.party_id===select.value)||teams[0];
      if(!party){view.innerHTML='<div class="empty-state">No team records available.</div>';return;}
      const players=(party.actors||[]).slice().sort((a,b)=>a.name.localeCompare(b.name));
      const leader=players.find(a=>a.actor_id===party.leader_actor_id);
      const state=formByTeam.get(party.party_id)||{form_state:'BASELINE_ESTABLISHING',trend:'UNRESOLVED',signals:[],contradictions:[]};
      const squad=depthByTeam.get(party.party_id)||{};
      const total=Number(party.player_count??players.length);
      const house=Number(party.house_players??players.filter(p=>p.chamber==='HOUSE').length);
      const senate=Number(party.senate_players??players.filter(p=>p.chamber==='SENATE').length);
      const coverage=squad.coverage_percent??100;

      view.innerHTML=`
        <article class="party-card team-focus">
          <div class="party-head">
            <div><span class="team-label">TEAM</span><h2>${esc(party.short_name)}</h2><p class="party-full">${esc(party.name)}</p></div>
            <span class="team-state">${esc(words(party.team_state))}</span>
          </div>
          <div class="leader-strip"><b>Captain / leader</b><span>${leader?esc(leader.name):'No parliamentary leader resolved in current roster'}</span></div>
          <div class="form-strip">
            <div><small>TOTAL FEDERAL PLAYERS</small><strong>${total}</strong></div>
            <div><small>HOUSE</small><strong>${house}</strong></div>
            <div><small>SENATE</small><strong>${senate}</strong></div>
            <div><small>FEDERAL INGESTION</small><strong>${coverage}% · COMPLETE</strong></div>
          </div>
          <div class="form-strip">
            <div><small>TEAM FORM</small><strong>${esc(words(state.form_state))}</strong></div>
            <div><small>TREND</small><strong>${esc(state.trend||'UNRESOLVED')}</strong></div>
            <div><small>LIVE SIGNALS</small><strong>${(state.signals||[]).length}</strong></div>
            <div><small>CONTRADICTIONS</small><strong>${(state.contradictions||[]).length}</strong></div>
          </div>
          <div class="roster-tools"><label for="team-player-filter"><b>Full federal roster</b> · ${total} / ${total} ingested</label><input id="team-player-filter" class="search-input" type="search" placeholder="Filter this team by player, seat or state"></div>
          <div id="team-roster" class="roster"></div>
        </article>`;

      const list=document.getElementById('team-roster');
      const filter=document.getElementById('team-player-filter');
      const drawPlayers=()=>{
        const q=String(filter?.value||'').trim().toLowerCase();
        const visible=players.filter(p=>!q||[p.name,p.role,p.division,p.state,p.chamber].some(v=>String(v||'').toLowerCase().includes(q)));
        list.innerHTML=visible.map(p=>`<div class="player-row"><div><span class="player-label">PLAYER · ${esc(p.chamber)}</span><b>${esc(p.name)}</b></div><span>${esc(p.role)}${p.state?` · ${esc(String(p.state).toUpperCase())}`:''}</span></div>`).join('')||'<div class="empty-state">No players match this filter.</div>';
      };
      filter?.addEventListener('input',drawPlayers);
      drawPlayers();
      history.replaceState(null,'',`${location.pathname}?team=${encodeURIComponent(party.party_id)}`);
    };

    select.addEventListener('change',render);
    render();

    const meta=document.getElementById('roster-meta');
    if(meta)meta.textContent=`${roster.counts.total_players} federal players ingested · ${roster.counts.party_affiliated} assigned to ${roster.counts.teams} party teams · ${roster.counts.independents} independents remain standalone players · ${roster.snapshot_id}`;
  }catch(err){
    view.innerHTML='<div class="empty-state"><b>Complete team roster unavailable</b><p>The federal runtime could not be loaded into this page.</p></div>';
  }
}

loadTeamIntelligence();
