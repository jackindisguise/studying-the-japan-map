// Parses the raw sources into data/records.json: one object per prefecture and island with the exact note field values
// (except images). Everything shown is in English, in the usual spelling without macrons.
import fs from 'node:fs';
import { PREFECTURES, ISLANDS, prefectureShapes, borders, islandShapes } from './geo.js';
import { romanName } from './romaji.js';

const raw = (f) => fs.readFileSync(`data/raw/wikipedia/${f}.wiki`, 'utf8');
const cities = JSON.parse(fs.readFileSync('data/cities.json', 'utf8'));

const pron = JSON.parse(fs.readFileSync('data/pronunciation.json', 'utf8')); // run scripts/pronunciation.js to refresh

const GDP_YEAR = 2022;
// Region as the source writes it -> English.
const REGIONS = {
  北海道: 'Hokkaido', 東北: 'Tohoku', 関東: 'Kanto', 中部: 'Chubu', 近畿: 'Kinki (Kansai)', 中国: 'Chugoku', 四国: 'Shikoku',
  九州: 'Kyushu and Okinawa',
};

// Seas, for the islands that belong to no named island group.
const WATERS = { 日本海: 'Sea of Japan', 瀬戸内海: 'Seto Inland Sea', 対馬海峡: 'Korea Strait', 玄界灘: 'Genkai Sea', 東シナ海: 'East China Sea' };

const noRefs = (s) => s.replace(/<!--[\s\S]*?-->/g, '').replace(/<ref[^>]*\/>/g, '').replace(/<ref[\s\S]*?<\/ref>/g, '');
const link = (s) => s.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').trim();
const num = (s) => Number(String(s).replace(/[^\d.]/g, ''));
const plainRomaji = (s) => s.normalize('NFD').replace(/\p{M}/gu, '');
const need = (v, what) => { if (!v) throw new Error(`Missing ${what}`); return v; };

// ---- Prefecture basics: name, reading, capital, largest city, region, population (census, 1 October 2025), area ----
const basics = new Map(noRefs(raw('prefectures')).split('=== 基礎データ ===')[1].split('\n|}')[0].split(/\n\|-[^\n]*/).flatMap((row) => {
  const cells = row.trim().split('\n').map((c) => link(c.replace(/^[|!]\s*/, '').replace(/^(?:(?:style|align|class)=(?:"[^"]*"|\S+)\s*)+\|\s*/, '')));
  if (!/^\d\d$/.test(cells[0])) return [];
  const [code, name, reading, capital, largest, , region, population, area] = cells;
  return [[code, { name, reading, capital, largest, region, population: num(population), area: num(area) }]];
}));

// ---- Governors, with their readings ----
const governors = new Map(noRefs(raw('governors')).split(/\n\|-[^\n]*/).flatMap((row) => {
  const code = row.match(/^\s*!\s*\{\{Display none\|(\d\d)\/\}\}/m)?.[1];
  const who = row.match(/\{\{Ruby\|\[\[(?:[^\]|]*\|)?([^\]]+)\]\]\|([^}|]+)/);
  return code && who ? [[code, { name: who[1].trim(), reading: who[2].trim() }]] : [];
}));

// ---- GDP, millions of yen ----
const gdp = new Map([...raw('gdp').split(`== ${GDP_YEAR} list ==`)[1].split(/\n== /)[0]
  .matchAll(/\{\{Flag\|([^}|]+)[^}]*\}\}\s*\n\|[^\n]*\n\|\s*([\d,]+)/gi)].map((m) => [plainRomaji(m[1].trim()).toLowerCase(), num(m[2])]));

// ---- Island population (census 2020) and area ----
const islandRows = new Map();
// The table of islands with 10,000 people or more: rank, island, population, area.
for (const row of noRefs(raw('islands')).split('== 人口順 ==')[1].split('また日本が実効支配')[0].split(/\n\|-[^\n]*/)) {
  const m = row.match(/\n\|[^\n]*?\[\[([^\]|]+)[^\n]*\n\|align=right\|\s*([\d,]+)[^\n]*\n\|align=right\|\s*([\d,.]+)/);
  if (m) islandRows.set(m[1], { population: num(m[2]), area: num(m[3]) });
}
// The table of all inhabited remote islands covers the small ones: population 2020, population 2015, area.
for (const row of noRefs(raw('remote-islands')).split('==有人離島の人口統計==')[1].split(/\n\|-[^\n]*/)) {
  const m = row.match(/(?:^|\n)\|\s*\[\[([^\]|]+)/);
  const n = [...row.matchAll(/align=right\s*\|\s*([\d,.]+)/g)].map((x) => num(x[1]));
  if (m && n.length >= 3 && !islandRows.has(m[1])) islandRows.set(m[1], { population: n[0], area: n[2] });
}

// The dollar values use the average exchange rate of the GDP year, as the GDP source states it.
const yenPerDollar = Number(need(raw('gdp').match(new RegExp(`exchange rate in ${GDP_YEAR}: JPY ([\\d.]+)`)), 'exchange rate')[1]);
const usd = (yenValue) => {
  const n = yenValue / yenPerDollar;
  if (n >= 1e12) return `US$${(n / 1e12).toFixed(2)} trillion`;
  return n >= 1e9 ? `US$${(n / 1e9).toFixed(1)} billion` : `US$${(Math.round(n / 100) * 100).toLocaleString('en-US')}`;
};

const int = (n) => Math.round(n).toLocaleString('en-US');
const km2 = (a) => `${a < 100 ? a.toFixed(2) : int(a)} km²`;
const yen = (n) => (n >= 1e12 ? `¥${(n / 1e12).toFixed(1)} trillion` : `¥${(n / 1e6).toFixed(2)} million`);
// Appends each value's rank within its list: "4,980,272 (#9/47)". 1 = highest; ties share a rank.
const rank = (list, fields) => {
  for (const field of fields) {
    for (const r of list) r[field] += ` (#${1 + list.filter((o) => o._n[field] > r._n[field]).length}/${list.length})`;
  }
};

const prefRomaji = (code) => PREFECTURES[Number(code) - 1].romaji;

const prefectures = PREFECTURES.map((p) => {
  const b = need(basics.get(p.code), `basics ${p.code}`);
  // The shapes are matched by position, so check that the names agree.
  if (prefectureShapes.get(p.code).name !== b.name) throw new Error(`${p.code}: shape is ${prefectureShapes.get(p.code).name}, table says ${b.name}`);
  // Okinawa is grouped with Kyushu.
  const key = b.region === '沖縄' ? '九州' : b.region;
  const region = need(REGIONS[key], `region ${b.region}`);
  const governor = need(governors.get(p.code), `governor ${p.code}`);
  const millions = need(gdp.get(plainRomaji(p.romaji).toLowerCase()), `GDP ${p.romaji}`);
  // The largest city is only shown when it is not the capital.
  const other = b.largest !== b.capital ? need(cities[b.largest], `reading of ${b.largest} (data/cities.json)`) : null;
  const next = borders(p.code);
  const perHead = (millions * 1e6) / b.population;
  const density = b.population / b.area;
  const kind = { 都: ' Metropolis', 道: '', 府: ' Prefecture', 県: ' Prefecture' }[b.name.slice(-1)];
  return {
    ID: `JP-${p.code}`, Kind: 'prefecture', Name: `${p.romaji}${kind}`,
    IPA: pron[p.code]?.ipa || '', Respelling: pron[p.code]?.respell || '',
    Region: region, 'Region Key': key,
    Capital: p.capital,
    'Largest City': other || '',
    Borders: next.map(prefRomaji).join(', '),
    Population: int(b.population), Area: km2(b.area), Density: `${int(density)}/km²`,
    GDP: yen(millions * 1e6), 'GDP USD': usd(millions * 1e6), 'GDP per Capita': yen(perHead), 'GDP per Capita USD': usd(perHead),
    Governor: romanName(governor.reading),
    'As Of': `Population 2025 · GDP FY${GDP_YEAR}`,
    _n: { Population: b.population, Area: b.area, Density: density, GDP: millions, 'GDP per Capita': perHead },
  };
});
rank(prefectures, ['Population', 'Area', 'Density', 'GDP', 'GDP per Capita']);

const islands = ISLANDS.map((s) => {
  const row = need(islandRows.get(s.wiki || s.name), `population of ${s.name}`);
  // The outline cut from the map must be about as big as the published area, or the point picked the wrong land.
  // (Iwo Jima is rising, so its older outline is smaller than the latest survey.)
  const drawn = islandShapes.get(s.id).km2;
  if (Math.abs(drawn / row.area - 1) > (s.areaTolerance || 0.15)) throw new Error(`${s.id}: drawn ${drawn.toFixed(1)} km², published ${row.area} km²`);
  const density = row.population / row.area;
  const many = s.prefectures.length > 7;
  return {
    ID: `JP-I-${s.id}`, Kind: 'island', Name: s.english,
    IPA: pron[`I-${s.id}`]?.ipa || '', Respelling: pron[`I-${s.id}`]?.respell || '',
    Region: s.group ? s.groupEnglish : need(WATERS[s.groupEnglish], `sea ${s.groupEnglish}`),
    Prefectures: many ? `${s.prefectures.length} prefectures` : s.prefectures.map(prefRomaji).join(', '),
    Municipalities: s.municipalities,
    Population: int(row.population), Area: km2(row.area), Density: `${int(density)}/km²`,
    'As Of': 'Population 2020',
    _n: { Population: row.population, Area: row.area, Density: density },
  };
});
// Island ranks are among the islands of this deck only.
rank(islands, ['Population', 'Area', 'Density']);

// Islands largest first, then prefectures in JIS code order (north to south). Anki shows new cards in this order.
islands.sort((a, z) => z._n.Area - a._n.Area);
// "Region Key" matches the sub-deck and is not shown, so it keeps the source's spelling. The IPA's marks are part of it.
const AS_IS = new Set(['Region Key', 'IPA']);
const records = [...islands, ...prefectures].map(({ _n, ...r }) => Object.fromEntries(
  Object.entries(r).map(([k, v]) => [k, AS_IS.has(k) ? v : plainRomaji(v)]),
));
fs.writeFileSync('data/records.json', JSON.stringify(records, null, 1) + '\n');
console.log(records.length, 'records');
for (const list of [prefectures, islands]) {
  const keys = Object.keys(list[0]).filter((k) => !k.startsWith('_'));
  for (const k of keys) {
    const empty = list.filter((r) => !r[k]).map((r) => r.Name);
    if (empty.length) console.log(k.padEnd(18), `empty (${empty.length}):`, empty.slice(0, 6).join(' '));
  }
}
