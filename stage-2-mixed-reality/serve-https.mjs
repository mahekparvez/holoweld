import { createServer } from 'node:https';
import { readFile, realpath, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve, sep, extname } from 'node:path';
import { pipeline } from 'node:stream/promises';

const [cert,key,output='dist']=process.argv.slice(2);
if(!cert || !key) {
  console.error('Usage: ./launch-https.sh fullchain.pem private-key.pem');
  process.exit(1);
}
const root=await realpath(output);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.xml':'application/xml','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
const port=Number(process.env.HOLOWELD_HTTPS_PORT||8443);
createServer({cert:await readFile(cert),key:await readFile(key)},async (req,res)=>{
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405).end();return;}
  try{
    const pathname=decodeURIComponent(new URL(req.url,'https://localhost').pathname);
    const file=await realpath(resolve(root,'.'+(pathname==='/'?'/index.html':pathname)));
    if(!file.startsWith(root+sep)) {res.writeHead(403).end();return;}
    const meta=await stat(file);
    if(!meta.isFile()){res.writeHead(404).end();return;}
    res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Content-Length':meta.size,'X-Content-Type-Options':'nosniff'});
    if(req.method==='HEAD')res.end();
    else await pipeline(createReadStream(file),res);
  }catch{
    if(!res.headersSent)res.writeHead(404).end();
    else res.destroy();
  }
}).listen(port,'0.0.0.0',()=>console.log(`HOLOWELD HTTPS listening on port ${port}`));
