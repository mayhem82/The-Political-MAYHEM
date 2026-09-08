import fs from 'node:fs';

const files=[
  'experiment-status.html',
  'index.html',
  'edge.html',
  'tipping.html',
  'single-signals.html',
  'README.md',
  'docs/NEW-THREAD-BOOTSTRAP.md',
  'docs/POLITICAL-MAYHEM-ARCHITECTURE.md'
];

const prohibited=[
  {label:'standalone FORWARD ONLY label',re:/\bFORWARD ONLY\b/g},
  {label:'Forward-only public label',re:/•\s*Forward-only\s*•/gi},
  {label:'Forward-first section',re:/^##\s+Forward-first\b/gim},
  {label:'built forward first architecture',re:/\b(?:system|architecture)\s+(?:is\s+)?built forward first\b/gi},
  {label:'retroactive discovery delayed until forward baseline',re:/do not build the retroactive[\s\S]{0,180}?until a genuine forward baseline/gi},
  {label:'forward system required before historical discovery',re:/forward system must exist before the historical discovery engine/gi}
];

for(const file of files){
  const text=fs.readFileSync(file,'utf8');
  for(const rule of prohibited){
    rule.re.lastIndex=0;
    if(rule.re.test(text)) throw new Error(`${file}: prohibited whole-system temporal framing: ${rule.label}`);
  }
}

const bootstrap=fs.readFileSync('docs/NEW-THREAD-BOOTSTRAP.md','utf8');
if(!bootstrap.includes('There is no forward-only experiment.')) throw new Error('bootstrap must explicitly state that there is no forward-only experiment');
if(!bootstrap.includes('Retrospective evidence discovery and ongoing capture')) throw new Error('bootstrap must preserve retrospective discovery and ongoing capture as parallel evidence streams');

const architecture=fs.readFileSync('docs/POLITICAL-MAYHEM-ARCHITECTURE.md','utf8');
if(!architecture.includes('## Temporal evidence architecture')) throw new Error('architecture must define the temporal evidence architecture');
if(!architecture.includes('The anti-hindsight boundary applies to a frozen prediction, not to the evidence universe.')) throw new Error('architecture must scope anti-hindsight to frozen prediction lineage');

console.log(`TEMPORAL_PROVENANCE_LANGUAGE_OK files=${files.length}`);
