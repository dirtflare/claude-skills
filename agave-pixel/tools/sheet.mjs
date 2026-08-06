/* 全品種のドット絵を1枚に並べて見比べるための確認用スクリプト */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const T = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png' };
const server = createServer(async (req,res)=>{ try{
  const f = join(ROOT, req.url==='/'?'index.html':decodeURIComponent(req.url.split('?')[0]));
  res.writeHead(200,{'content-type':T[extname(f)]||'text/plain'}); res.end(await readFile(f));
}catch{ res.writeHead(404).end(); }});
await new Promise(r=>server.listen(4174,r));
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1200,height:900} });
p.on('pageerror', e=>console.error('ERR', String(e)));
await p.goto('http://localhost:4174/');
await p.waitForSelector('#view');
const stages = process.argv.includes('--stages');
const html = await p.evaluate(async (stages) => {
  const { SPECIES } = await import('./assets/js/data.js');
  const { proceduralSprite, composeCharacter } = await import('./assets/js/sprite.js');
  const load = (src) => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; });
  const cells = [];
  for (const sp of SPECIES) {
    const list = stages ? [0,1,2,3,4] : [3];
    const imgs = [];
    for (const st of list) {
      const img = await load(proceduralSprite(sp, sp.bias, `sheet:${sp.id}`, st));
      imgs.push(composeCharacter(img, { stage: st, branch: null, genes: sp.bias, world: sp.world, pest: 0, seed: sp.id }).toDataURL());
    }
    cells.push(`<div style="text-align:center"><div style="display:flex;gap:2px;justify-content:center">${
      imgs.map(u=>`<img src="${u}" style="width:${stages?86:150}px;image-rendering:pixelated">`).join('')
    }</div><div style="font:12px sans-serif;color:#cfe">${sp.no}. ${sp.ja} <span style="color:#7a9">${sp.form}</span></div></div>`);
  }
  document.body.innerHTML = `<div style="background:#08150f;padding:16px;display:grid;grid-template-columns:repeat(${stages?2:5},1fr);gap:14px">${cells.join('')}</div>`;
  return true;
}, stages);
await p.waitForTimeout(300);
await p.screenshot({ path: stages ? 'tools/shots/13-stages.png' : 'tools/shots/12-species.png', fullPage: true });
await b.close(); server.close();
console.log('done');
