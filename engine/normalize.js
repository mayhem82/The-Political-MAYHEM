'use strict';

function text(v=''){
  return String(v).trim().replace(/\s+/g,' ');
}

function key(v=''){
  return text(v).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}

function evidenceState(v='UNKNOWN'){
  const state=String(v).toUpperCase();
  return ['VERIFIED','UNVERIFIED','CONTRADICTED','SIGNAL','UNKNOWN'].includes(state)?state:'UNKNOWN';
}

function sourceClass(v=''){
  return key(v).toUpperCase().replace(/-/g,'_');
}

function normalizeObservation(observation={}){
  if(!observation.captured_at) throw new Error('CAPTURE_TIME_REQUIRED');
  const captured=Date.parse(observation.captured_at);
  if(!Number.isFinite(captured)) throw new Error('CAPTURE_TIME_INVALID');
  return {
    ...observation,
    party_name:observation.party_name?text(observation.party_name):observation.party_name,
    actor_name:observation.actor_name?text(observation.actor_name):observation.actor_name,
    jurisdiction:observation.jurisdiction?text(observation.jurisdiction):observation.jurisdiction,
    source_name:text(observation.source_name),
    source_class:sourceClass(observation.source_class),
    evidence_state:evidenceState(observation.evidence_state||observation.classification),
    captured_at:new Date(captured).toISOString()
  };
}

module.exports={text,key,evidenceState,sourceClass,normalizeObservation};
