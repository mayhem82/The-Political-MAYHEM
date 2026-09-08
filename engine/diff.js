'use strict';

function diffRecords(oldRows,newRows,key='record_id'){
  const oldMap=new Map(oldRows.map(row=>[row[key],row]));
  const newMap=new Map(newRows.map(row=>[row[key],row]));
  const changes=[];
  for(const [id,row] of oldMap){
    if(!newMap.has(id)) changes.push({type:'REMOVED_RECORD',id,before:row});
  }
  for(const [id,row] of newMap){
    if(!oldMap.has(id)){
      changes.push({type:'ADDED_RECORD',id,after:row});
      continue;
    }
    const before=oldMap.get(id);
    for(const field of new Set([...Object.keys(before),...Object.keys(row)])){
      if(JSON.stringify(before[field])!==JSON.stringify(row[field])){
        changes.push({type:'FIELD_CHANGED',id,field,before:before[field],after:row[field]});
      }
    }
  }
  return changes;
}

module.exports={diffRecords};
