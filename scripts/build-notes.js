// Writes one Anki-importable CSV note file with a row per prefecture and island to build/notes.csv.
// Fields follow the Japan Map note type; Map holds <img> tags that use the real file names in build/media/.
// Usage: node scripts/build-notes.js
import fs from 'node:fs';

const DECK = 'Studying the Japan Map', MODEL = 'Japan Map', TAG = 'japan-map';
const PREFECTURE_DECK = `${DECK}::02. Prefectures`, ISLAND_DECK = `${DECK}::01. Islands`;
// [region key in the records, sub-deck name]
const REGIONS = [
  ['北海道', 'Hokkaido'], ['東北', 'Tohoku'], ['関東', 'Kanto'], ['中部', 'Chubu'],
  ['近畿', 'Kinki'], ['中国', 'Chugoku'], ['四国', 'Shikoku'], ['九州', 'Kyushu and Okinawa'],
];
const FIELDS = [
  'Name', 'Map', 'Region', 'Capital', 'Largest City', 'Prefectures', 'Municipalities', 'Borders',
  'Population', 'GDP', 'GDP USD', 'GDP per Capita', 'GDP per Capita USD', 'Area', 'Density', 'Governor', 'As Of', 'Kind', 'ID', 'Flag',
];

// Already in study order: islands from largest to smallest, then prefectures from north to south.
const records = JSON.parse(fs.readFileSync('data/records.json', 'utf8'));
const boxes = JSON.parse(fs.readFileSync('build/fit/boxes.json', 'utf8'));
const csv = (v) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

const header = [
  '#separator:Comma', '#html:true', `#notetype:${MODEL}`,
  `#columns:${[...FIELDS, 'Deck', 'Tags'].join(',')}`,
  `#deck column:${FIELDS.length + 1}`, `#tags column:${FIELDS.length + 2}`,
];
// Prefectural flags are copied into build/media/ next to the maps.
fs.mkdirSync('build/media', { recursive: true });
// Several Commons files give only a width and height; without a viewBox a resized image is cropped instead of scaled.
const scalable = (svg) => svg.replace(/<svg[^>]*>/, (tag) => {
  if (/\sviewBox=/.test(tag)) return tag;
  const [w, h] = ['width', 'height'].map((a) => Number(tag.match(new RegExp(`\\s${a}="([\\d.e]+)`))?.[1]));
  if (!w || !h) throw new Error(`Flag without a size: ${tag}`);
  return tag.replace('<svg', `<svg viewBox="0 0 ${w} ${h}"`);
});
const flagOf = (r) => {
  if (r.Kind !== 'prefecture') return '';
  const name = `jp-flag-${r.ID.slice(3)}.svg`;
  fs.writeFileSync(`build/media/${name}`, scalable(fs.readFileSync(`data/flags-svg/${r.ID.slice(3)}.svg`, 'utf8')));
  return `<img src="${name}">`;
};
const rows = records.map((r) => {
  const stem = r.ID.slice(3);
  const zoom = `jp-zoom-${stem}.svg`;
  const f = {
    ...r,
    Flag: flagOf(r),
    Map: `<img src="jp-map-${stem}.svg" data-box="${boxes[r.ID].join(',')}">`
      // Small targets also get a zoom box the card pins to its top-left corner.
      + (fs.existsSync(`build/media/${zoom}`) ? `<img class="zoom" src="${zoom}">` : ''),
  };
  const i = REGIONS.findIndex(([key]) => key === r['Region Key']);
  const deck = r.Kind === 'island' ? ISLAND_DECK : `${PREFECTURE_DECK}::${String(i + 1).padStart(2, '0')}. ${REGIONS[i][1]}`;
  return [...FIELDS.map((k) => f[k] || ''), deck, `${TAG} ${TAG}::${r.Kind}`].map(csv).join(',');
});
fs.mkdirSync('build', { recursive: true });
fs.writeFileSync('build/notes.csv', [...header, ...rows].join('\n') + '\n');
console.log('wrote', rows.length, 'notes to build/notes.csv');
