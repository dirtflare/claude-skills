/* PIXAGAVE — 単一 HTML へのバンドル
 * ES Modules を小さなモジュールレジストリ方式で 1 ファイルにまとめる。
 * 静的ホスティングが使えない場所(単体ファイル配布・埋め込み)向け。
 *   node tools/bundle.mjs  →  dist/pixagave.html
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

/* 依存順。循環参照はない前提 */
const ORDER = ['data', 'store', 'sprite', 'pixelize', 'game', 'creator', 'ui', 'main'];

const IMPORT_RE = /import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"];?/g;
const EXPORT_LIST_RE = /export\s*\{([\s\S]*?)\};?/g;
const EXPORT_DECL_RE = /export\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g;

const specifiers = (raw) =>
  raw.split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    const [local, alias] = s.split(/\s+as\s+/).map((x) => x.trim());
    return { local, exposed: alias || local };
  });

const modName = (path) => `__m_${path.replace(/.*\//, '').replace(/\.js$/, '')}`;

async function wrap(name) {
  const src = await readFile(resolve(ROOT, `assets/js/${name}.js`), 'utf8');

  const imports = [];
  for (const m of src.matchAll(IMPORT_RE)) {
    const from = modName(m[2]);
    const bindings = specifiers(m[1])
      .map(({ local, exposed }) => (local === exposed ? local : `${local}: ${exposed}`))
      .join(', ');
    imports.push(`const { ${bindings} } = ${from};`);
  }

  const exported = new Map();
  for (const m of src.matchAll(EXPORT_DECL_RE)) exported.set(m[1], m[1]);
  for (const m of src.matchAll(EXPORT_LIST_RE)) {
    for (const { local, exposed } of specifiers(m[1])) exported.set(exposed, local);
  }

  const body = src
    .replace(IMPORT_RE, '')
    .replace(EXPORT_LIST_RE, '')
    .replace(/^export\s+(?=(?:async\s+)?(?:const|let|var|function|class)\s)/gm, '');

  const returns = [...exported].map(([exposed, local]) =>
    (exposed === local ? exposed : `${exposed}: ${local}`)).join(', ');

  return `/* ---- ${name}.js ---- */\nconst ${modName(name)} = (() => {\n${imports.join('\n')}\n${body}\nreturn { ${returns} };\n})();`;
}

const css = await readFile(resolve(ROOT, 'assets/css/app.css'), 'utf8');
const html = await readFile(resolve(ROOT, 'index.html'), 'utf8');

/* index.html の body 内だけを取り出し、外部参照を落とす */
const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/);
const markup = bodyMatch[1]
  .replace(/<script[\s\S]*?<\/script>/g, '')
  .replace(/<noscript>[\s\S]*?<\/noscript>/g, '')
  .trim();

const modules = [];
for (const name of ORDER) modules.push(await wrap(name));

const out = `<title>PIXAGAVE — 育てた実物が、そのままキャラクターになる</title>
<style>
${css}
</style>
${markup}
<script type="module">
${modules.join('\n\n')}
</script>
`;

await mkdir(resolve(ROOT, 'dist'), { recursive: true });
await writeFile(resolve(ROOT, 'dist/pixagave.html'), out);
console.log(`dist/pixagave.html — ${Math.round(out.length / 1024)} KB`);
