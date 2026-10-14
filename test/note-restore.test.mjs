import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createNoteRestoreHandler,noteContentHash} from '../src/note-restore-handler.mjs';
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002';
const ID='00000000-0000-4000-8000-000000000022',OTHER='00000000-0000-4000-8000-000000000033';
function fixture({missing=false,foreign=false,race=false,collision=false}={}) {
  const note={schema:'aleph.note-backup.v1',id:ID,ownerId:B,title:'B fixture',body:'synthetic recovery fixture'};
  note.contentSha256=noteContentHash(note);
  const raw=JSON.stringify(note);
  const env={SUPABASE_URL:'https://fixture.invalid',SUPABASE_SECRET_KEY:'fixture-only',
    VAULT_RECOVERY_TEST_B_ID:B,VAULT_NOTE_BACKUP:raw,
    VAULT_NOTE_BACKUP_SHA256:createHash('sha256').update(raw).digest('hex')};
  const rows=[{id:OTHER,owner_id:A,title:'untouched',body:'untouched'},
    ...missing?[]:[{id:ID,owner_id:foreign?A:B,title:'changed fixture',body:'changed fixture'}]];
  const audit=['prior audit fixture'];let writes=0;
  const db={from(table){assert.equal(table,'notes');let operation='read',payload,filters=[],columns;
    const execute=()=>{
      if(operation==='update'&&race)rows.find(row=>row.id===ID).owner_id=A;
      let found=rows.filter(row=>filters.every(([k,v])=>row[k]===v));
      if(operation==='insert') {
        if(collision||rows.some(row=>row.id===payload.id))return {data:null,error:{code:'23505'}};
        rows.push({...payload});found=[rows.at(-1)];writes++;
      }
      if(operation==='update') {found.forEach(row=>Object.assign(row,payload));writes+=found.length;}
      const row=found[0];return {data:row?Object.fromEntries(columns.split(',').map(key=>[key,row[key]])):null,error:null};
    };
    const query={select(v){columns=v;return query;},eq(k,v){filters.push([k,v]);return query;},
      update(v){operation='update';payload=v;return query;},insert(v){operation='insert';payload=v;return query;},
      async maybeSingle(){return execute();}};
    return query;
  }};
  const handler=createNoteRestoreHandler({env,createClient:()=>db,verifyLogin:async token=>
    token==='fixture-b'?{kind:'student',userId:B}:token==='fixture-a'?{kind:'student',userId:A}:null});
  const call=async({actor='fixture-b',method='POST',body={id:ID,ownerId:B,contentSha256:note.contentSha256},url='/api/restore-note'}={})=>{
    const res={setHeader(){},status(v){this.code=v;return this;},json(v){this.data=v;return this;}};
    await handler({method,url,body,headers:actor?{authorization:actor}:{}},res);
    return res;
  };
  return {call,rows,audit,note,env,get writes(){return writes;}};
}
test('B restores exactly the designated memo with matching id, owner and hash while preserving others and audit',async()=>{
  for(const missing of [false,true]) {
    const f=fixture({missing}),other=structuredClone(f.rows[0]),audit=structuredClone(f.audit);
    const result=await f.call();
    assert.equal(result.code,200);assert.deepEqual(result.data,{id:ID,ownerId:B,contentSha256:f.note.contentSha256,restored:true});
    const restored=f.rows.find(row=>row.id===ID);
    assert.equal(restored.owner_id,B);assert.equal(noteContentHash(restored),f.note.contentSha256);
    assert.deepEqual(f.rows[0],other);assert.deepEqual(f.audit,audit);assert.equal(f.writes,1);
    assert.equal(Object.hasOwn(result.data,'body'),false);assert.equal(Object.hasOwn(result.data,'title'),false);
  }
});
test('A, no login, wrong id/owner/hash and client content cannot restore or write',async()=>{
  const f=fixture(),before=structuredClone(f.rows);
  assert.equal((await f.call({actor:'fixture-a'})).code,403);
  assert.equal((await f.call({actor:null})).code,401);
  for(const patch of [{id:OTHER},{ownerId:A},{contentSha256:'0'.repeat(64)}])
    assert.equal((await f.call({body:{id:ID,ownerId:B,contentSha256:f.note.contentSha256,...patch}})).code,409);
  assert.equal((await f.call({body:{id:ID,ownerId:B,contentSha256:f.note.contentSha256,body:'client data'}})).code,400);
  assert.equal((await f.call({method:'GET'})).code,405);
  assert.equal((await f.call({url:'/api/restore-note?action=other'})).code,404);
  assert.deepEqual(f.rows,before);assert.equal(f.writes,0);
});
test('missing/tampered backup, notice scope and owner collisions fail without touching another memo',async()=>{
  const missing=fixture();delete missing.env.VAULT_NOTE_BACKUP;assert.equal((await missing.call()).code,503);
  const corrupt=fixture();corrupt.env.VAULT_NOTE_BACKUP+=' ';assert.equal((await corrupt.call()).code,422);
  const foreign=fixture({foreign:true});assert.equal((await foreign.call()).code,403);assert.equal(foreign.writes,0);
  const notice=fixture();notice.env.VAULT_RESOURCE_POLICY=JSON.stringify({noticeIds:[ID],instructorUserIds:[],subjects:[]});
  assert.equal((await notice.call()).code,403);assert.equal(notice.writes,0);
  const race=fixture({race:true});assert.equal((await race.call()).code,409);assert.equal(race.writes,0);
  const collision=fixture({missing:true,collision:true});assert.equal((await collision.call()).code,409);assert.equal(collision.writes,0);
});
