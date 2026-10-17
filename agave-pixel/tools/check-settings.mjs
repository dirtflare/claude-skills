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
await new Promise(r=>server.listen(4176,r));
const b = await chromium.launch();
const p = await b.newPage();
p.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0,200)));
p.on('console', m => m.type()==='error' && console.log('CONSOLE:', m.text().slice(0,200)));
await p.goto('http://localhost:4176/');
await p.waitForSelector('#view');
await p.click('[data-close]').catch(()=>{});
await p.evaluate(() => window.PIXAGAVE.go('settings'));
await p.waitForTimeout(200);

console.log('--- pace ---');
console.log('before:', await p.evaluate(()=>window.PIXAGAVE.game.state.settings.pace));
await p.click('[data-pace="fast"]');
await p.waitForTimeout(200);
console.log('after :', await p.evaluate(()=>window.PIXAGAVE.game.state.settings.pace));
console.log('aria  :', await p.getAttribute('[data-pace="fast"]','aria-pressed'));

console.log('--- lang ---');
await p.selectOption('#set-lang','en');
await p.waitForTimeout(300);
console.log('lang state:', await p.evaluate(()=>window.PIXAGAVE.game.state.lang));
console.log('nav text  :', await p.evaluate(()=>[...document.querySelectorAll('#rail-nav button')].map(b=>b.textContent.trim()).join('|')));
console.log('page h1   :', await p.textContent('.page-head h1'));
console.log('select val:', await p.inputValue('#set-lang'));

console.log('--- pixel ---');
await p.evaluate(()=>{ const el=document.querySelector('#set-grid'); el.value=64; el.dispatchEvent(new Event('input',{bubbles:true})); });
await p.waitForTimeout(150);
console.log('grid state:', await p.evaluate(()=>window.PIXAGAVE.game.state.settings.grid));
console.log('grid label:', await p.textContent('#lab-grid'));
await b.close(); server.close();
