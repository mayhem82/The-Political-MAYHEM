async function loadPartyRosters(){
  const host=document.getElementById('party-rosters');
  if(!host)return;
  try{
    const res=await fetch('data/runtime/party-rosters.json',{cache:'no-store'});
    if(!res.ok)throw new Error(`HTTP ${res.status}`);
    const data=await res.json();
    host.innerHTML='';
    for(const party of data.parties||[]){
      const card=document.createElement('article');
      card.className='party-card';
      const leader=(party.actors||[]).find(a=>a.actor_id===party.leader_actor_id);
      card.innerHTML=`
        <div class="party-head">
          <div>
            <span class="team-label">TEAM</span>
            <h3>${party.short_name}</h3>
            <p class="party-full">${party.name}</p>
          </div>
          <span class="team-state">${party.team_state.replaceAll('_',' ')}</span>
        </div>
        <div class="leader-strip"><b>Captain / leader</b><span>${leader?leader.name:'Not resolved'}</span></div>
        <div class="roster"></div>
      `;
      const roster=card.querySelector('.roster');
      for(const actor of party.actors||[]){
        const row=document.createElement('div');
        row.className='player-row';
        row.innerHTML=`<div><span class="player-label">PLAYER</span><b>${actor.name}</b></div><span>${actor.role}</span>`;
        roster.appendChild(row);
      }
      host.appendChild(card);
    }
    const meta=document.getElementById('roster-meta');
    if(meta)meta.textContent=`${data.scope} • ${data.parties.length} tracked teams • baseline ${data.snapshot_id}`;
  }catch(err){
    host.innerHTML='<div class="empty-state"><b>Roster feed unavailable</b><p>The party roster data exists in the runtime layer but could not be loaded into this page.</p></div>';
  }
}
loadPartyRosters();
