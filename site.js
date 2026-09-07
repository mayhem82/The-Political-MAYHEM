async function loadPartyRosters(){
  const host=document.getElementById('party-rosters');
  if(!host)return;
  try{
    const [rosterRes,formRes]=await Promise.all([
      fetch('data/runtime/party-rosters.json',{cache:'no-store'}),
      fetch('data/runtime/team-player-form.json',{cache:'no-store'})
    ]);
    if(!rosterRes.ok)throw new Error(`Roster HTTP ${rosterRes.status}`);
    if(!formRes.ok)throw new Error(`Form HTTP ${formRes.status}`);
    const data=await rosterRes.json();
    const form=await formRes.json();
    const teamForm=new Map((form.team_form||[]).map(x=>[x.party_id,x]));
    host.innerHTML='';
    for(const party of data.parties||[]){
      const card=document.createElement('article');
      card.className='party-card';
      const leader=(party.actors||[]).find(a=>a.actor_id===party.leader_actor_id);
      const state=teamForm.get(party.party_id)||{form_state:'UNKNOWN',trend:'UNRESOLVED',signals:[],contradictions:[],tip_effects:[]};
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
        <div class="form-strip">
          <div><small>TEAM FORM</small><strong>${state.form_state.replaceAll('_',' ')}</strong></div>
          <div><small>TREND</small><strong>${state.trend}</strong></div>
          <div><small>LIVE SIGNALS</small><strong>${(state.signals||[]).length}</strong></div>
          <div><small>CONTRADICTIONS</small><strong>${(state.contradictions||[]).length}</strong></div>
        </div>
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
    if(meta)meta.textContent=`${data.scope} • ${data.parties.length} tracked teams • roster ${data.snapshot_id} • form ${form.snapshot_id}`;
    const formMeta=document.getElementById('form-meta');
    if(formMeta)formMeta.textContent=`Forward form baseline active • ${form.form_dimensions.team.length} team dimensions • ${form.form_dimensions.player.length} player dimensions • no unsupported form rating is fabricated`;
  }catch(err){
    host.innerHTML='<div class="empty-state"><b>Roster/form feed unavailable</b><p>The runtime data exists but could not be loaded into this page.</p></div>';
  }
}
loadPartyRosters();
