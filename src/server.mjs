import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve('web');
const project = JSON.parse(await (await import('node:fs/promises')).readFile('project.json', 'utf8'));
const types = { '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.json':'application/json; charset=utf-8','.txt':'text/plain; charset=utf-8','.xml':'application/xml; charset=utf-8' };
export function buildServer() {
  return createServer((req, res) => {
    const host = String(req.headers.host || '').toLowerCase().split(':')[0];
    if (!project.hostnames.includes(host) && !['localhost','127.0.0.1'].includes(host)) return respond(res, 421, 'Unknown host\n');
    if (!['GET','HEAD'].includes(req.method || '')) { res.setHeader('Allow','GET, HEAD'); return respond(res,405,'Method not allowed\n'); }
    const forwarded = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
    if (!['localhost','127.0.0.1'].includes(host) && forwarded !== 'https') { res.writeHead(308,{Location:`https://${host}${req.url || '/'}`,'Cache-Control':'no-store'}); return res.end(); }
    const common = { 'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=(), payment=(), usb=()', 'Content-Security-Policy':"default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'none'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; upgrade-insecure-requests", 'Cache-Control':'no-cache' };
    if (forwarded === 'https') common['Strict-Transport-Security']='max-age=604800';
    const pathname = (() => { try { return decodeURIComponent(new URL(req.url || '/', 'http://local').pathname); } catch { return ''; } })();
    if (pathname === '/healthz') { res.writeHead(200,{...common,'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}); return res.end(req.method === 'HEAD' ? undefined : `${project.id}-ready`); }
    const relative = pathname === '/' ? '/index.html' : pathname;
    const file = resolve(root, `.${relative}`);
    if (file !== root && !file.startsWith(root + sep)) return respond(res,400,'Bad request\n',common);
    if (!existsSync(file) || !statSync(file).isFile()) return respond(res,404,'Not found\n',common);
    res.writeHead(200,{...common,'Content-Type':types[extname(file)] || 'application/octet-stream'});
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).on('error',()=>{if(!res.headersSent)respond(res,500,'Request failed\n',common);else res.destroy();}).pipe(res);
  });
}
function respond(res,status,body,headers={}) { res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store',...headers});res.end(body); }
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) { const port=Number(process.env.PORT || 8080);buildServer().listen(port,'0.0.0.0',()=>process.stdout.write(`${project.id} listener ready on ${port}\n`)); }
