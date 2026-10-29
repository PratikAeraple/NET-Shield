import https from 'node:https';
import { readFileSync } from 'node:fs';
https.createServer({key:readFileSync('/certs/lab.key'),cert:readFileSync('/certs/lab.crt')},(_,res)=>res.end('tls-lab-ready')).listen(8443,'0.0.0.0');
