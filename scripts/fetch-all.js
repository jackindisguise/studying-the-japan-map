// Downloads the source files into data/raw/ (they are kept with the project, so builds work offline).
// Usage: node scripts/fetch-all.js             fetches only the missing files
//        node scripts/fetch-all.js --refresh   fetches everything again
import fs from 'node:fs';
import path from 'node:path';

const wiki = (lang, page) => `https://${lang}.wikipedia.org/w/index.php?title=${encodeURIComponent(page)}&action=raw`;
const SOURCES = {
  'mlit/prefectures.topojson': 'https://raw.githubusercontent.com/smartnews-smri/japan-topography/main/data/municipality/topojson/s0010/prefectures.json',
  'wikipedia/prefectures.wiki': wiki('ja', '都道府県'),
  'wikipedia/population.wiki': wiki('ja', '都道府県の人口一覧'),
  'wikipedia/area.wiki': wiki('ja', '都道府県の面積一覧'),
  'wikipedia/capitals.wiki': wiki('ja', '都道府県庁所在地'),
  'wikipedia/governors.wiki': wiki('ja', '都道府県知事の一覧'),
  'wikipedia/gdp.wiki': wiki('en', 'List_of_Japanese_prefectures_by_GDP'),
  'wikipedia/islands.wiki': wiki('ja', '日本の島の一覧'),
  'wikipedia/remote-islands.wiki': wiki('ja', '離島振興法'),
};

const refresh = process.argv.includes('--refresh');
for (const [file, url] of Object.entries(SOURCES)) {
  const out = `data/raw/${file}`;
  if (!refresh && fs.existsSync(out)) continue;
  const res = await fetch(url, { headers: { 'User-Agent': 'anki-deck-builder/1.0' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  console.log('fetched', out);
}
