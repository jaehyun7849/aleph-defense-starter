import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {protectDeviceRequests} from '../src/protected-device-handler.mjs';
const response=()=>({setHeader(){},status(code){this.code=code;return this;},json(data){this.data=data;return this;}});
test('direct stage 11 reads/writes/restore reject login-only and forged device claims before the data handler',async()=>{
  let calls=0;
  const handler=protectDeviceRequests({config:{step:11},verifyLogin:async()=>({userId:'fixture'}),handler:async()=>{calls++;}});
  for(const url of ['/api/notes','/api/notes/fixture','/api/notices','/api/notices/fixture','/api/restore-note']) {
    for(const method of ['GET','POST','PUT','DELETE']) {
      const res=response();
      await handler({url,method,headers:{authorization:'fixture','x-device-registered':'true','x-app-installed':'true'},
        body:{approved:true,deviceRegistered:true}},res);
      assert.equal(res.code,403);assert.equal(res.data.reasonCode,'device_approval_unavailable');
      assert.equal('notes' in res.data,false);
    }
  }
  assert.equal(calls,0);
});
test('missing/invalid login is rejected and earlier stages still delegate to original authorization',async()=>{
  let calls=0;
  for(const [authorization,expected] of [[undefined,'login_required'],['invalid','invalid_login']]) {
    const res=response();
    await protectDeviceRequests({config:{step:11},verifyLogin:async()=>null,handler:async()=>calls++})({headers:{authorization}},res);
    assert.equal(res.code,401);assert.equal(res.data.reasonCode,expected);
  }
  assert.equal(calls,0);
  await protectDeviceRequests({config:{step:10},verifyLogin:async()=>{throw new Error('not used');},handler:async()=>calls++})({},response());
  assert.equal(calls,1);
});
test('production notes, notice aliases and restore entry points include the server gate',async()=>{
  for(const path of ['notes.js','restore-note.js']) {
    const source=await readFile(new URL('../api/'+path,import.meta.url),'utf8');
    assert.match(source,/export default protectDeviceRequests\(/);
  }
  for(const path of ['notices.js','notes/[id].js','notices/[id].js']) {
    const source=await readFile(new URL('../api/'+path,import.meta.url),'utf8');
    assert.match(source,/export \{ default \} from/);
  }
});
