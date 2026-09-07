async function loadPartyRosters(){
  const host=document.getElementById('party-rosters');
  if(!host)return;
  try{
    const [rosterRes,formRes,depthRes]=await Promise.all([
      fetch('data/runtime/party-rosters.json',{cache:'no-store'}),
      fetch('data/runtime/team-player-form.json',{cache:'no-store'}),
      fetch('data/runtime/team-squad-depth.json',{cache:'no-store'})
    ]);
    if(!rosterRes.ok)throw new Error(`Roster HTTP ${rosterRes.status}`);
    if(!formRes.ok)throw new Error(`Form HTTP ${formRes.status}`);
    if(!depthRes.ok)throw new Error(`Squad depth HTTP ${depthRes.status}`);
    const data=await rosterRes.json();
    const form=await formRes.json();
    const depth=await depthRes.json();
    const teamForm=new Map((form.team_form||[]).map(x=>[x.party_id,x]));
    const squadDepth=new Map((depth.teams||[]).map(x=>[x.party_id,x]));
    host.innerHTML='';
    for(const party of data.parties||[]){
      const card=document.createElement('article');
      card.className='party-card';
      const leader=(party.actors||[]).find(a=>a.actor_id===party.leader_actor_id);
      const state=teamForm.get(party.party_id)||{form_state:'UNKNOWN',trend:'UNRESOLVED',signals:[],contradictions:[],tip_effects:[]};
      const squad=squadDepth.get(party.party_id)||{federal_parliamentary_squad:'—',tracked_intelligence_players:(party.actors||[]).length,coverage_state:'UNKNOWN',related_affiliates:[]};
      const affiliateNote=(squad.related_affiliates||[]).length?`${squad.related_affiliates[0].name}: ${(squad.related_affiliates[0].federal_parliamentarians??'—')} separate federal affiliates`:'No separate affiliate count';
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
          <div><small>FEDERAL PARLIAMENTARY SQUAD</small><strong>${squad.federal_parliamentary_squad}</strong></div>
          <div><small>TRACKED INTELLIGENCE PLAYERS</small><strong>${(party.actors||[]).length}</strong></div>
          <div><small>ROSTER COVERAGE</small><strong>${String(squad.coverage_state||'UNKNOWN').replaceAll('_',' ')}</strong></div>
          <div><small>AFFILIATE DEPTH</small><strong>${affiliateNote}</strong></div>
        </div>
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
        row.innerHTML=`<div><span class="player-label">TRACKED PLAYER</span><b>${actor.name}</b></div><span>${actor.role}</span>`;
        roster.appendChild(row);
      }
      host.appendChild(card);
    }
    const meta=document.getElementById('roster-meta');
    if(meta)meta.textContent=`${data.scope} • ${data.parties.length} tracked teams • roster ${data.snapshot_id} • squad depth ${depth.snapshot_id} • form ${form.snapshot_id}`;
    const formMeta=document.getElementById('form-meta');
    if(formMeta)formMeta.textContent=`Team size now distinguishes the full current federal parliamentary squad from the smaller intelligence roster shown on each card. One Nation's current federal parliamentary squad is fully tracked; larger parties remain partial intelligence rosters. Source: ${depth.source.publisher}.`;
  }catch(err){
    host.innerHTML='<div class="empty-state"><b>Roster/form feed unavailable</b><p>The runtime data exists but could not be loaded into this page.</p></div>';
  }
}
loadPartyRosters();
