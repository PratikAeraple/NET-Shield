import test from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { buildServer } from '../src/server.mjs';
import project from '../project.json' with { type: 'json' };

let server, base;
const rawRequest=(path,headers={},method='GET')=>new Promise((resolve,reject)=>{
  const req=httpRequest(new URL(path,base),{method,headers},res=>{const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks).toString()}));});
  req.on('error',reject);req.end();
});
test('site server', async t => {
  server=buildServer(); await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  base=`http://127.0.0.1:${server.address().port}`;
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const request=(path='/',headers={},options={})=>fetch(base+path,{...options,headers:{Host:project.hostname,'X-Forwarded-Proto':'https',...headers}});
  await t.test('serves unique identity health without runtime details',async()=>{const r=await request('/healthz');assert.equal(r.status,200);assert.equal(await r.text(),`${project.id}-ready`);});
  await t.test('serves portal with security headers and identity',async()=>{const r=await request('/');const body=await r.text();assert.equal(r.status,200);assert.match(body,new RegExp(project.id,'i'));assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.equal(r.headers.get('strict-transport-security'),'max-age=604800');});
  await t.test('serves architecture and lab evidence pages',async()=>{for(const path of ['/architecture.html','/lab.html']){const r=await request(path);assert.equal(r.status,200);assert.match(await r.text(),/NETSHIELD/);}});
  await t.test('redirects HTTP to same-host HTTPS once',async()=>{const r=await rawRequest('/architecture.html?view=full',{Host:project.hostname,'X-Forwarded-Proto':'http'});assert.equal(r.status,308);assert.equal(r.headers.location,`https://${project.hostname}/architecture.html?view=full`);});
  await t.test('rejects unknown hosts and methods',async()=>{assert.equal((await rawRequest('/',{Host:'unapproved.example'})).status,421);assert.equal((await rawRequest('/',{Host:project.hostname,'X-Forwarded-Proto':'https'},'POST')).status,405);});
  await t.test('returns a real 404 for missing content',async()=>{assert.equal((await request('/missing.html')).status,404);});
});
