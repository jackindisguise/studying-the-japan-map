// Japanese pronunciation of each prefecture's and island's name, as English Wiktionary records it. Nothing is guessed:
// a place whose Japanese entry lists no pitch accent gets no pronunciation.
//  1. The {{ja-pron}} templates of each name's Japanese section, kept only when they list a pitch accent for that reading.
//  2. Wiktionary renders each template; the IPA and the romaji with pitch marks are taken from the result
//     (à low, á high, ꜜ where the pitch drops). Where an entry lists several accents, the first is used.
//  3. Respelling ("NAH-gah-noh"): made from that romaji by scripts/respell.js.
// 1 and 2 are cached in data/raw/wiktionary/japanese.json so the deck can be rebuilt offline.
// Writes data/pronunciation.json: { "13": { ipa: "[…]", respell: "…", pitch: "…", title: "東京" }, "I-sado": … }.
// Usage: node scripts/pronunciation.js            use the cache, fetch only what is missing
//        node scripts/pronunciation.js --refresh  fetch everything again (needs internet access)
import fs from 'node:fs';
import { respell } from './respell.js';

const API = 'https://en.wiktionary.org/w/api.php';
const UA = { 'User-Agent': 'anki-deck-builder/1.0' };
const RAW = 'data/raw/wiktionary/japanese.json';
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Katakana as hiragana, without the spacing and accent marks the templates allow in a reading.
const hira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60)).replace(/[\s.\-^%・]/g, '');

// The places and the entries to try for each, in order: [{ key, name, forms: [[title, reading]] }].
const places = [];
for (const s of read('data/islands.json')) {
  const forms = [[s.name, s.reading]];
  // A card name like "Sado Island" drops the island ending, so the Japanese name without it counts too, and comes first.
  const short = s.reading.match(/^(.+?)(しま|じま|とう)$/);
  if (/ Island$/.test(s.english) && short && s.name.endsWith('島')) forms.unshift([s.name.slice(0, -1), short[1]]);
  places.push({ key: `I-${s.id}`, name: s.english, forms });
}
// Prefecture names and readings, from the same Japanese Wikipedia table the records use.
const table = fs.readFileSync('data/raw/wikipedia/prefectures.wiki', 'utf8').split('=== 基礎データ ===')[1].split('\n|}')[0];
const cell = (c) => c.replace(/^[|!]\s*/, '').replace(/^(?:(?:style|align|class)=(?:"[^"]*"|\S+)\s*)+\|\s*/, '')
  .replace(/<ref[\s\S]*$/, '').replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').trim();
for (const row of table.split(/\n\|-[^\n]*/)) {
  const [code, name, reading] = row.trim().split('\n').map(cell);
  if (!/^\d\d$/.test(code)) continue;
  // Hokkaido's "do" is part of the name; the other endings (ken, fu, to) are not on the card.
  const keep = code === '01';
  const short = keep ? name : name.slice(0, -1);
  places.push({ key: code, name: short, forms: [[short, keep ? hira(reading) : hira(reading).replace(/(けん|ふ|と)$/, '')], [name, hira(reading)]] });
}
if (places.filter((p) => !p.key.startsWith('I-')).length !== 47) throw new Error('Expected 47 prefectures');

const cache = fs.existsSync(RAW) && !process.argv.includes('--refresh') ? read(RAW) : { entries: {}, rendered: {} };
const save = () => { fs.mkdirSync('data/raw/wiktionary', { recursive: true }); fs.writeFileSync(RAW, `${JSON.stringify(cache, null, 1)}\n`); };

async function api(params) {
  const body = new URLSearchParams({ ...params, format: 'json', formatversion: '2' });
  for (let i = 0; i < 6; i++) {
    const r = await fetch(API, { method: 'POST', headers: UA, body });
    if (r.ok) return r.json();
    await sleep(Number(r.headers.get('retry-after')) * 1000 || 5000 * (i + 1));
  }
  throw new Error('Wiktionary request failed');
}

// Entries, 50 titles to a request.
const titles = [...new Set(places.flatMap((p) => p.forms.map(([t]) => t)))].filter((t) => !cache.entries[t]);
for (let i = 0; i < titles.length; i += 50) {
  const j = await api({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', titles: titles.slice(i, i + 50).join('|') });
  if (j.continue) throw new Error('Wiktionary cut the reply short; use smaller batches');
  for (const page of j.query.pages) {
    const wikitext = page.revisions?.[0]?.slots?.main?.content;
    const section = wikitext?.match(/(?:^|\n)==Japanese==\n([\s\S]*?)(?=\n==[^=]|$)/)?.[1] || '';
    cache.entries[page.title] = section.match(/\{\{ja-pron\b[^{}]*(?:\{\{[^{}]*\}\}[^{}]*)*\}\}/g) || [];
  }
  save();
  await sleep(1000);
}

// The template to render for a place: the first one that lists an accent for the expected reading, without its references
// and audio files. An accent is a number (the syllable after which the pitch drops, 0 for none) or a letter code.
const templateOf = (place) => {
  for (const [title, reading] of place.forms) {
    for (const line of cache.entries[title] || []) {
      const args = line.replace(/<ref[^>]*\/>|<ref[\s\S]*?<\/ref>/g, '').slice(2, -2).split('|').slice(1);
      const kana = args.filter((a) => !a.includes('=')).map(hira);
      if (kana.length && !kana.includes(reading)) continue; // another reading of the same characters
      if (!args.some((a) => /^\s*acc\d?\s*=\s*[\dhano]/.test(a))) continue;
      return { title, template: `{{ja-pron|${args.filter((a) => !/^\s*(a|audio|acc\d?_ref)\s*=/.test(a)).join('|')}}}` };
    }
  }
  return null;
};
const picked = places.map((p) => ({ ...p, ...templateOf(p) }));

const missing = [...new Set(picked.map((p) => p.template).filter((t) => t && !cache.rendered[t]))];
if (missing.length) {
  const text = missing.map((t, i) => `<div id="place-${i}">\n${t}\n</div>`).join('\n');
  const html = (await api({ action: 'parse', text, contentmodel: 'wikitext', prop: 'text' })).parse.text;
  const parts = html.split(/<div id="place-\d+">/).slice(1);
  if (parts.length !== missing.length) throw new Error('Could not split the rendered templates');
  parts.forEach((part, i) => {
    const ipa = part.match(/class="IPA[^"]*">([^<]+)</)?.[1];
    // Voiceless vowels are struck through in the rendering; the letters are kept (the IPA marks them too).
    const pitch = part.match(/<samp>\[([\s\S]*?)\]<\/samp>/)?.[1].replace(/<[^>]*>/g, '');
    if (!ipa || !pitch) throw new Error(`No pronunciation rendered for ${missing[i]}`);
    cache.rendered[missing[i]] = { ipa, pitch };
  });
  save();
}

const out = Object.fromEntries(picked.filter((p) => p.template).map((p) => [p.key, { ipa: cache.rendered[p.template].ipa, respell: respell(cache.rendered[p.template].pitch), pitch: cache.rendered[p.template].pitch, title: p.title }]));
fs.writeFileSync('data/pronunciation.json', `${JSON.stringify(out, null, 1)}\n`);
console.log('pronunciations:', Object.keys(out).length, '/', places.length, 'missing:', picked.filter((p) => !p.template).map((p) => p.name).join(', '));
