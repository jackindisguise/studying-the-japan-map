// Downloads the prefectural flags (SVG) from Wikimedia Commons to data/flags-svg/<code>.svg.
// Commons limits the request rate and may ask for a wait of several minutes. (The committed copies of 44 to 47 came
// byte for byte from github.com/johnmorrisdotca/hata, data-sources/commons.)
// Usage: node scripts/fetch-flags.js             fetches only the missing files
//        node scripts/fetch-flags.js --refresh   fetches everything again
import fs from 'node:fs';

const UA = { 'User-Agent': 'anki-deck-builder/1.0' };
const prefectures = JSON.parse(fs.readFileSync('data/prefectures.json', 'utf8'));
const refresh = process.argv.includes('--refresh');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Commons file name: "Flag of Aomori Prefecture.svg" (no macrons); Tokyo is a metropolis.
const fileName = ({ code, romaji }) => `Flag of ${romaji.normalize('NFD').replace(/\p{M}/gu, '')} ${code === '13' ? 'Metropolis' : 'Prefecture'}.svg`;

fs.mkdirSync('data/flags-svg', { recursive: true });
for (const p of prefectures) {
  const out = `data/flags-svg/${p.code}.svg`;
  if (!refresh && fs.existsSync(out)) continue;
  const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName(p))}`;
  let res;
  for (let i = 0; i < 6; i++) {
    res = await fetch(url, { headers: UA });
    if (res.status !== 429) break;
    const wait = Number(res.headers.get('retry-after')) || 5 * (i + 1);
    console.log(`rate limited, waiting ${wait} s`);
    await sleep(wait * 1000);
  }
  const body = Buffer.from(await res.arrayBuffer());
  if (!res.ok || !body.includes('<svg')) throw new Error(`${res.status}: ${fileName(p)}`);
  fs.writeFileSync(out, body);
  console.log('fetched', out, fileName(p));
  await sleep(1000);
}
