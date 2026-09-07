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
      const squad=squadDepth.get(party.party_id)||{federal_parliamentary_squad:null,tracked_intelligence_players:(party.actors||[]).length,coverage_state:'UNKNOWN',related_affiliates:[]};
      const total=Number.isFinite(Number(squad.federal_parliamentary_squad))?Number(squad.federal_parliamentary_squad):null;
      const tracked=(party.actors||[]).length;
      const untracked=total==null?null:Math.max(total-tracked,0);
      const coverage=total&&total>0?Math.round((tracked/total)*100):null;
      const affiliateNote=(squad.related_affiliates||[]).length
        ?(squad.related_affiliates||[]).map(a=>`${a.name}: ${a.federal_parliamentarians??'—'}`).join(' · ')
        :'None separately counted';
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
          <div><small>TOTAL FEDERAL PLAYERS</small><strong>${total??'—'}</strong></div>
          <div><small>IN-DEPTH COVERAGE</small><strong>${total==null?tracked:`${tracked} / ${total}`}${coverage==null?'':` · ${coverage}%`}</strong></div>
          <div><small>NOT YET SHOWN IN DEPTH</small><strong>${untracked??'—'}</strong></div>
          <div><small>SEPARATE AFFILIATES</small><strong>${affiliateNote}</strong></div>
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
        row.innerHTML=`<div><span class="player-label">PLAYER SHOWN IN DEPTH</span><b>${actor.name}</b></div><span>${actor.role}</span>`;
        roster.appendChild(row);
      }
      host.appendChild(card);
    }
    const meta=document.getElementById('roster-meta');
    if(meta)meta.textContent=`${data.scope} • ${data.parties.length} tracked teams • roster ${data.snapshot_id} • squad depth ${depth.snapshot_id} • form ${form.snapshot_id}`;
    const formMeta=document.getElementById('form-meta');
    if(formMeta)formMeta.textContent=`Count rule: TOTAL FEDERAL PLAYERS is the team size. IN-DEPTH COVERAGE is a subset of that same total, not an additional group. Example: One Nation 6 / 6 means six total federal players and all six shown in depth — not twelve players.`;
  }catch(err){
    host.innerHTML='<div class="empty-state"><b>Roster/form feed unavailable</b><p>The runtime data exists but could not be loaded into this page.</p></div>';
  }
}
loadPartyRosters();
