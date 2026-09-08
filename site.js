const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const words=s=>String(s??'UNKNOWN').replaceAll('_',' ');

async function loadTeamIntelligence(){
  const jurisdiction=document.getElementById('team-jurisdiction');
  const select=document.getElementById('team-select');
  const view=document.getElementById('team-view');
  if(!select||!view)return;

  try{
    const [rosterRes,formRes,depthRes,stateRes]=await Promise.all([
      fetch('data/runtime/party-rosters.json?'+Date.now(),{cache:'no-store'}),
      fetch('data/runtime/team-player-form.json?'+Date.now(),{cache:'no-store'}),
      fetch('data/runtime/team-squad-depth.json?'+Date.now(),{cache:'no-store'}),
      fetch('data/runtime/state-territory-parliamentary-players.json?'+Date.now(),{cache:'no-store'})
    ]);
    if(!rosterRes.ok||!formRes.ok||!depthRes.ok||!stateRes.ok)throw new Error('Roster runtime unavailable');

    const roster=await rosterRes.json();
    const form=await formRes.json();
    const depth=await depthRes.json();
    const state=await stateRes.json();
    const formByTeam=new Map((form.team_form||[]).map(x=>[x.party_id,x]));
    const depthByTeam=new Map((depth.teams||[]).map(x=>[x.party_id,x]));

    const fields=[{
      id:'AUS-FED',label:'Federal Finals',level:'FEDERAL',independents:roster.counts.independents,
      teams:(roster.parties||[]).map(t=>({...t,display_name:t.short_name,players:t.actors||[],state:formByTeam.get(t.party_id),coverage:depthByTeam.get(t.party_id)?.coverage_percent??100}))
    },...(state.jurisdictions||[]).map(j=>({
      id:j.competition_id,label:j.competition_id==='AUS-ACT'?'ACT':'Northern Territory',level:j.level,independents:j.counts.independents,
      teams:(j.teams||[]).map(t=>({...t,display_name:t.name,team_state:'ACTIVE_PARLIAMENTARY_TEAM',players:(j.players||[]).filter(p=>p.party_id===t.party_id),state:{form_state:'BASELINE_ESTABLISHING',trend:'UNRESOLVED',signals:[],contradictions:[]},coverage:100}))
    }))];

    if(jurisdiction){
      jurisdiction.innerHTML=fields.map(f=>`<option value="${esc(f.id)}">${esc(f.label)} · ${f.teams.length} teams</option>`).join('');
      const requestedJurisdiction=new URLSearchParams(location.search).get('jurisdiction');
      if(fields.some(f=>f.id===requestedJurisdiction))jurisdiction.value=requestedJurisdiction;
    }

    const currentField=()=>fields.find(f=>f.id===(jurisdiction?.value||'AUS-FED'))||fields[0];

    const populateTeams=()=>{
      const field=currentField();
      const teams=field.teams.slice().sort((a,b)=>a.display_name.localeCompare(b.display_name));
      select.innerHTML=teams.map(t=>`<option value="${esc(t.party_id)}">${esc(t.display_name)} · ${t.player_count??t.players.length} players</option>`).join('');
      const requestedTeam=new URLSearchParams(location.search).get('team');
      const hit=teams.find(t=>t.party_id===requestedTeam||t.display_name.toLowerCase()===String(requestedTeam||'').toLowerCase());
      if(hit)select.value=hit.party_id;
      render();
    };

    const render=()=>{
      const field=currentField();
      const teams=field.teams;
      const party=teams.find(t=>t.party_id===select.value)||teams[0];
      if(!party){view.innerHTML='<div class="empty-state">No team records available for this competition.</div>';return;}
      const players=(party.players||[]).slice().sort((a,b)=>a.name.localeCompare(b.name));
      const leader=players.find(a=>a.actor_id===party.leader_actor_id);
      const stateRecord=party.state||{form_state:'BASELINE_ESTABLISHING',trend:'UNRESOLVED',signals:[],contradictions:[]};
      const total=Number(party.player_count??players.length);
      const isFederal=field.id==='AUS-FED';
      const house=isFederal?Number(party.house_players??players.filter(p=>p.chamber==='HOUSE').length):players.filter(p=>p.chamber==='LEGISLATIVE_ASSEMBLY').length;
      const senate=isFederal?Number(party.senate_players??players.filter(p=>p.chamber==='SENATE').length):0;
      const chamberLabel=isFederal?'HOUSE':'LEGISLATIVE ASSEMBLY';

      view.innerHTML=`
        <article class="party-card team-focus">
          <div class="party-head">
            <div><span class="team-label">TEAM · ${esc(field.label)}</span><h2>${esc(party.display_name)}</h2><p class="party-full">${esc(party.name||party.display_name)}</p></div>
            <span class="team-state">${esc(words(party.team_state||'ACTIVE_PARLIAMENTARY_TEAM'))}</span>
          </div>
          <div class="leader-strip"><b>Captain / leader</b><span>${leader?esc(leader.name):isFederal?'No parliamentary leader resolved in current roster':'Leader object not yet linked in this competition roster'}</span></div>
          <div class="form-strip">
            <div><small>TOTAL PLAYERS</small><strong>${total}</strong></div>
            <div><small>${chamberLabel}</small><strong>${house}</strong></div>
            <div><small>${isFederal?'SENATE':'STANDALONE INDEPENDENTS'}</small><strong>${isFederal?senate:field.independents}</strong></div>
            <div><small>ROSTER INGESTION</small><strong>${party.coverage}% · COMPLETE</strong></div>
          </div>
          <div class="form-strip">
            <div><small>TEAM FORM</small><strong>${esc(words(stateRecord.form_state))}</strong></div>
            <div><small>TREND</small><strong>${esc(stateRecord.trend||'UNRESOLVED')}</strong></div>
            <div><small>LIVE SIGNALS</small><strong>${(stateRecord.signals||[]).length}</strong></div>
            <div><small>CONTRADICTIONS</small><strong>${(stateRecord.contradictions||[]).length}</strong></div>
          </div>
          <div class="roster-tools"><label for="team-player-filter"><b>Full ${esc(field.label)} roster</b> · ${total} / ${total} ingested</label><input id="team-player-filter" class="search-input" type="search" placeholder="Filter this team by player or electorate"></div>
          <div id="team-roster" class="roster"></div>
        </article>`;

      const list=document.getElementById('team-roster');
      const filter=document.getElementById('team-player-filter');
      const drawPlayers=()=>{
        const q=String(filter?.value||'').trim().toLowerCase();
        const visible=players.filter(p=>!q||[p.name,p.role,p.division,p.electorate,p.state,p.chamber].some(v=>String(v||'').toLowerCase().includes(q)));
        list.innerHTML=visible.map(p=>`<div class="player-row"><div><span class="player-label">PLAYER · ${esc(words(p.chamber))}</span><b>${esc(p.name)}</b></div><span>${esc(p.role||'')}${p.electorate?` · ${esc(p.electorate)}`:p.division?` · ${esc(p.division)}`:''}</span></div>`).join('')||'<div class="empty-state">No players match this filter.</div>';
      };
      filter?.addEventListener('input',drawPlayers);
      drawPlayers();
      history.replaceState(null,'',`${location.pathname}?jurisdiction=${encodeURIComponent(field.id)}&team=${encodeURIComponent(party.party_id)}`);
    };

    jurisdiction?.addEventListener('change',populateTeams);
    select.addEventListener('change',render);
    populateTeams();

    const meta=document.getElementById('roster-meta');
    if(meta)meta.textContent=`${roster.counts.total_players+state.coverage.completed_player_count} parliamentary players ingested across Federal Finals, ACT and Northern Territory · ${state.coverage.pending_jurisdictions.length} state competitions remain roster-pending · ${state.snapshot_id}`;
  }catch(err){
    view.innerHTML='<div class="empty-state"><b>Team rosters unavailable</b><p>The current competition roster runtime could not be loaded into this page.</p></div>';
  }
}

loadTeamIntelligence();
