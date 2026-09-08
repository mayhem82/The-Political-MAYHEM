import fs from 'node:fs';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const fail=[];
const assert=(condition,message)=>{if(!condition)fail.push(message)};

const registry=read('data/forward-signal-source-registry.json');
const publicRegistry=read('data/research-sites-2026.json');
const active=(registry.sources||[]).filter(x=>x.active);
const sites=publicRegistry.sites||[];
const bySourceId=new Map();

for(const site of sites){
  assert(Boolean(site.source_id),`public research site lacks source_id: ${site.name||'UNKNOWN'}`);
  if(!site.source_id) continue;
  assert(!bySourceId.has(site.source_id),`duplicate public research source_id ${site.source_id}`);
  bySourceId.set(site.source_id,site);
  assert(Boolean(site.url),`${site.source_id}: public research site URL missing`);
  assert(Boolean(site.class),`${site.source_id}: public research site class missing`);
  assert(Boolean(site.jurisdiction),`${site.source_id}: public research site jurisdiction missing`);
  assert(typeof site.research_use==='string'&&site.research_use.trim().length>0,`${site.source_id}: research_use missing`);
}

for(const source of active){
  const site=bySourceId.get(source.source_id);
  assert(Boolean(site),`${source.source_id}: active forward source missing from public Research Sites registry`);
  if(!site) continue;
  assert(site.url===source.url,`${source.source_id}: public URL differs from active forward registry`);
  assert(site.class===source.source_class,`${source.source_id}: public source class differs from active forward registry`);
  assert(site.jurisdiction===source.jurisdiction_id,`${source.source_id}: public jurisdiction differs from active forward registry`);
}

const activeIds=new Set(active.map(x=>x.source_id));
for(const site of sites){
  assert(activeIds.has(site.source_id),`${site.source_id}: public Research Sites entry is not an active forward source`);
}

assert(sites.length===active.length,`public Research Sites count ${sites.length} does not match active forward source count ${active.length}`);
assert(publicRegistry.purpose?.includes('not evidence by itself')===true,'public Research Sites purpose lost source-location/evidence distinction');
assert((publicRegistry.rules||[]).some(x=>x==='A site listing is not evidence by itself.'),'public Research Sites evidence disclaimer missing');

if(fail.length){
  console.error('POLITICAL_MAYHEM_RESEARCH_SITE_PARITY_FAILED');
  for(const message of fail) console.error('- '+message);
  process.exit(1);
}
console.log('POLITICAL_MAYHEM_RESEARCH_SITE_PARITY_PASS',`active=${active.length}`,`public=${sites.length}`,`jurisdictions=${new Set(active.map(x=>x.jurisdiction_id)).size}`);
