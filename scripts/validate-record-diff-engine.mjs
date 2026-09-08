import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {diffRecords}=require('../engine/diff.js');
const fail=[];
const assert=(condition,message)=>{if(!condition)fail.push(message)};

const before=[
  {record_id:'A',value:1,stable:'same'},
  {record_id:'B',value:2}
];
const after=[
  {record_id:'A',value:3,stable:'same'},
  {record_id:'C',value:4}
];
const beforeFrozen=JSON.stringify(before);
const afterFrozen=JSON.stringify(after);
const changes=diffRecords(before,after);

assert(changes.length===3,`expected 3 changes, got ${changes.length}`);
assert(changes.some(x=>x.type==='REMOVED_RECORD'&&x.id==='B'&&x.before?.value===2),'removed record B not detected');
assert(changes.some(x=>x.type==='ADDED_RECORD'&&x.id==='C'&&x.after?.value===4),'added record C not detected');
assert(changes.some(x=>x.type==='FIELD_CHANGED'&&x.id==='A'&&x.field==='value'&&x.before===1&&x.after===3),'field change A.value not detected');
assert(!changes.some(x=>x.type==='FIELD_CHANGED'&&x.id==='A'&&x.field==='stable'),'unchanged field incorrectly reported');
assert(JSON.stringify(before)===beforeFrozen,'old record set mutated');
assert(JSON.stringify(after)===afterFrozen,'new record set mutated');

const custom=diffRecords([{id:'X',state:'OLD'}],[{id:'X',state:'NEW'}],'id');
assert(custom.length===1&&custom[0].type==='FIELD_CHANGED'&&custom[0].id==='X'&&custom[0].field==='state','custom key diff failed');

if(fail.length){
  console.error('POLITICAL_MAYHEM_RECORD_DIFF_ENGINE_INTEGRITY_FAILED');
  for(const message of fail) console.error('- '+message);
  process.exit(1);
}
console.log('POLITICAL_MAYHEM_RECORD_DIFF_ENGINE_INTEGRITY_PASS','changes=3','customKey=PASS','mutation=NONE');
