import assert from 'node:assert/strict';
import dns from 'node:dns/promises';
import net from 'node:net';
import https from 'node:https';
import { readFileSync } from 'node:fs';

const expectDnsFailure = async host => {
  await assert.rejects(dns.lookup(host), e => ['ENOTFOUND','EAI_AGAIN'].includes(e.code));
};
const expectTcpFailure = (host, port, timeout=1200) => new Promise((resolve,reject) => {
  const socket=net.createConnection({host,port});
  const timer=setTimeout(()=>{socket.destroy();resolve('timeout')},timeout);
  socket.once('connect',()=>{clearTimeout(timer);socket.destroy();reject(new Error(`${host}:${port} unexpectedly accepted TCP`));});
  socket.once('error',e=>{clearTimeout(timer);resolve(e.code || 'network-error');});
});
const verifyTlsNameRejected = () => new Promise((resolve,reject) => {
  const request=https.get({hostname:'netshield-lab-tls',port:8443,servername:'netshield-lab-tls',ca:readFileSync('/certs/lab.crt'),timeout:1500},()=>reject(new Error('mismatched TLS name was accepted')));
  request.on('error',e=>e.code==='ERR_TLS_CERT_ALTNAME_INVALID'?resolve(e.code):reject(e));
  request.on('timeout',()=>request.destroy(new Error('TLS check timeout')));
});

async function healthy() {
  assert.equal(await (await fetch('http://netshield-lab-web:8080/')).text(),'netshield-lab-ready');
  await assert.rejects(dns.lookup('netshield-lab-no-such-name'),e=>['ENOTFOUND','EAI_AGAIN'].includes(e.code));
  await expectDnsFailure('netshield-lab-isolated-target');
  const closed=await expectTcpFailure('netshield-lab-web',8081);
  assert.ok(['ECONNREFUSED','timeout','network-error'].includes(closed));
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),100);
  await assert.rejects(fetch('http://netshield-lab-web:8080/slow',{signal:controller.signal}),e=>e.name==='AbortError');
  clearTimeout(timer);
  const tlsCode=await verifyTlsNameRejected();
  console.log(JSON.stringify({status:'LAB VALIDATED',scenarios:{dns_resolution_failure:'detected',network_segmentation:'isolated DNS name unavailable',incorrect_port:closed,application_timeout:'detected',tls_hostname_mismatch:tlsCode}}));
}

async function outage() {
  const ip=process.env.NETSHIELD_STOPPED_WEB_IP;
  assert.match(ip || '',/^(?:\d{1,3}\.){3}\d{1,3}$/);
  const result=await expectTcpFailure(ip,8080,800);
  assert.ok(['ECONNREFUSED','timeout','network-error'].includes(result));
  console.log(JSON.stringify({status:'LAB VALIDATED',scenario:'service unavailable',result}));
}

if (process.argv[2]==='outage') await outage(); else await healthy();
