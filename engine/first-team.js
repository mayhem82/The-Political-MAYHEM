'use strict';

const CLAIM_CLASSES=[
  'DIRECT_PUBLIC_DECISION',
  'SAMPLED_PUBLIC_OPINION',
  'POLITICAL_REPRESENTATION_CLAIM',
  'PUBLIC_MOBILISATION',
  'INSTITUTIONAL_RESPONSE_TO_PUBLIC_PRESSURE',
  'PUBLIC_SILENCE_OR_ABSENCE'
];

const FIRST_TEAM_EFFECTS=[
  'NONE',
  'NARROW_OPINION_EVIDENCE_ONLY',
  'DIRECT_DECISION_RECORDED',
  'MEASURABLE_PUBLIC_OUTCOME_RECORDED',
  'UNKNOWN_PENDING_EVIDENCE'
];

function classifyPublicEvidence(record={}){
  const explicit=String(record.claim_class||record.classification||'').toUpperCase();
  if(CLAIM_CLASSES.includes(explicit)) return explicit;
  const type=String(record.event_type||record.type||'').toUpperCase();
  const text=String(record.claim_text||record.claim||record.title||record.observed_behaviour||'').toLowerCase();
  if(type.includes('REFERENDUM')||type.includes('ELECTION_RESULT')||type==='ELECTION') return 'DIRECT_PUBLIC_DECISION';
  if(type.includes('POLL')||type.includes('SURVEY')) return 'SAMPLED_PUBLIC_OPINION';
  if(type.includes('PROTEST')||type.includes('PETITION')||type.includes('MOBILISATION')||type.includes('CAMPAIGN')) return 'PUBLIC_MOBILISATION';
  if(type.includes('INSTITUTIONAL_RESPONSE')) return 'INSTITUTIONAL_RESPONSE_TO_PUBLIC_PRESSURE';
  if(type.includes('PUBLIC_SILENCE')) return 'PUBLIC_SILENCE_OR_ABSENCE';
  if(/\b(australians want|ordinary australians|the people have spoken|will of the people|public interest|we have a mandate|mandate from the people)\b/.test(text)) return 'POLITICAL_REPRESENTATION_CLAIM';
  return null;
}

function defaultFirstTeamEffect(claimClass,{authoritatively_verified=false,causal_lineage_verified=false}={}){
  switch(claimClass){
    case 'DIRECT_PUBLIC_DECISION': return authoritatively_verified?'DIRECT_DECISION_RECORDED':'UNKNOWN_PENDING_EVIDENCE';
    case 'SAMPLED_PUBLIC_OPINION': return 'NARROW_OPINION_EVIDENCE_ONLY';
    case 'INSTITUTIONAL_RESPONSE_TO_PUBLIC_PRESSURE': return causal_lineage_verified?'MEASURABLE_PUBLIC_OUTCOME_RECORDED':'UNKNOWN_PENDING_EVIDENCE';
    case 'POLITICAL_REPRESENTATION_CLAIM':
    case 'PUBLIC_MOBILISATION':
    case 'PUBLIC_SILENCE_OR_ABSENCE': return 'NONE';
    default: return 'NONE';
  }
}

function mayMoveFirstTeamForm(claimClass,{authoritatively_verified=false,causal_lineage_verified=false}={}){
  if(claimClass==='DIRECT_PUBLIC_DECISION') return Boolean(authoritatively_verified);
  if(claimClass==='INSTITUTIONAL_RESPONSE_TO_PUBLIC_PRESSURE') return Boolean(causal_lineage_verified);
  return false;
}

function validateClaimRecord(record={}){
  const required=['claim_id','claim_text','speaker_or_source','claim_time','claim_class','jurisdiction','population_scope','evidence_state','source_lineage','first_team_effect'];
  const missing=required.filter(k=>record[k]===undefined||record[k]===null||record[k]==='');
  if(missing.length) throw new Error(`FIRST_TEAM_CLAIM_FIELDS_REQUIRED:${missing.join(',')}`);
  if(!CLAIM_CLASSES.includes(record.claim_class)) throw new Error('INVALID_FIRST_TEAM_CLAIM_CLASS');
  if(!FIRST_TEAM_EFFECTS.includes(record.first_team_effect)) throw new Error('INVALID_FIRST_TEAM_EFFECT');
  if(record.claim_class==='SAMPLED_PUBLIC_OPINION'&&record.first_team_effect==='DIRECT_DECISION_RECORDED') throw new Error('POLL_CANNOT_BECOME_DIRECT_DECISION');
  if(['POLITICAL_REPRESENTATION_CLAIM','PUBLIC_MOBILISATION','PUBLIC_SILENCE_OR_ABSENCE'].includes(record.claim_class)&&['DIRECT_DECISION_RECORDED','MEASURABLE_PUBLIC_OUTCOME_RECORDED'].includes(record.first_team_effect)) throw new Error('PROXY_CANNOT_MOVE_FIRST_TEAM_FORM');
  return true;
}

function validateOutcomeRecord(record={}){
  const allowed=['ELECTION_RESULT','REFERENDUM_RESULT','MEASURABLE_PUBLIC_DRIVEN_INSTITUTIONAL_OUTCOME'];
  const required=['outcome_id','outcome_class','jurisdiction','decision_or_event_date','verified_result','population_scope','authoritative_source','source_lineage','first_team_form_effect'];
  const missing=required.filter(k=>record[k]===undefined||record[k]===null||record[k]==='');
  if(missing.length) throw new Error(`FIRST_TEAM_OUTCOME_FIELDS_REQUIRED:${missing.join(',')}`);
  if(!allowed.includes(record.outcome_class)) throw new Error('INVALID_FIRST_TEAM_OUTCOME_CLASS');
  if(['ELECTION_RESULT','REFERENDUM_RESULT'].includes(record.outcome_class)&&record.authoritative_source===false) throw new Error('DIRECT_OUTCOME_REQUIRES_AUTHORITATIVE_SOURCE');
  if(record.outcome_class==='MEASURABLE_PUBLIC_DRIVEN_INSTITUTIONAL_OUTCOME'&&record.causal_lineage_verified!==true) throw new Error('PUBLIC_PRESSURE_OUTCOME_REQUIRES_CAUSAL_LINEAGE');
  return true;
}

module.exports={CLAIM_CLASSES,FIRST_TEAM_EFFECTS,classifyPublicEvidence,defaultFirstTeamEffect,mayMoveFirstTeamForm,validateClaimRecord,validateOutcomeRecord};
