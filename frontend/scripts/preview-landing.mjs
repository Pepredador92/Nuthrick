// Serve the actual Vercel output locally, including its static files.
import { gzipSync } from 'node:zlib';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import handler from '../.vercel/output/functions/__server.func/index.mjs';
const root = resolve('.vercel/output/static');
const types={'.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.ico':'image/x-icon'};
createServer(async(req,res)=>{
  const send=(status,headers,body)=>{
    delete headers['content-length'];
    if(/gzip/.test(req.headers['accept-encoding']||'') && /text|javascript|json|xml|svg/.test(headers['content-type']||'')) {
      headers['content-encoding']='gzip'; headers.vary='Accept-Encoding'; body=gzipSync(body);
    }
    res.writeHead(status,headers);res.end(body);
  };
  try {
    const url=new URL(req.url,'http://localhost:4188');
    const file=resolve(root,'.'+decodeURIComponent(url.pathname));
    if(file.startsWith(root+sep)&&extname(file)) {
      try {const data=await readFile(file);send(200,{'content-type':types[extname(file)]||'application/octet-stream','cache-control':url.pathname.startsWith('/_next/static/')?'public, max-age=31536000, immutable':'public, max-age=3600'},data);return;} catch {}
    }
    const response=await handler.fetch(new Request(url,{method:req.method,headers:req.headers}),{});
    send(response.status,Object.fromEntries(response.headers),Buffer.from(await response.arrayBuffer()));
  } catch(error) {console.error(error);res.writeHead(500);res.end('Preview error');}
}).listen(4188,'127.0.0.1',()=>console.log('Landing preview: http://localhost:4188'));
