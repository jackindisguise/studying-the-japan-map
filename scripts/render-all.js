// Renders one SVG map per prefecture and island into build/media/ (all, or only the codes and island ids given),
// plus build/fit/boxes.json. Each map is a big square, north-up Mercator view centred on the target at a true ground
// scale. Prefecture maps show the prefecture in red among the other prefectures; island maps show the island in purple
// with no prefecture borders. Other countries are grey. The card script scales and positions the image so the target
// fits any window, using the box recorded in boxes.json.
// Small islands also get a zoom box (build/media/jp-zoom-<id>.svg) with a scale bar, which the card pins to its
// top-left. As in the World Map deck, a very small target gets a solid dot on each part too small to see.
// Usage: node scripts/render-all.js [13 sado ...]
import fs from 'node:fs';
import { feature, merge } from 'topojson-client';
import { geoMercator, geoPath, geoArea, geoBounds, geoCentroid, geoDistance } from 'd3-geo';
import { PREFECTURES, ISLANDS, prefectureShapes, islandShapes, rewind } from './geo.js';

const SIZE = 4000; // canvas of the main map, px
const SHARE = 0.4; // the target's larger side takes at most this share of the canvas
const MIN_CANVAS_KM = 4000;
const CONTEXT_KM = 1300; // the card never zooms in past a view this many kilometres across
// Far-off places need a wider view to show where they are.
const WIDE = {
  47: 2600, okinawa: 2400, kume: 2400, amami: 1900, tokunoshima: 2000, okinoerabu: 2100,
  miyako: 3000, ishigaki: 3200, iriomote: 3200, yonaguni: 3300,
  hachijo: 1500, chichijima: 2900, ioto: 3300,
};
const ZOOM_MAX_KM2 = 400; // smaller islands get a zoom box; prefectures never do
const ZOOM_MAX_FRAME_KM = 241; // the World Map deck's 150 miles: a wider zoom box would hardly enlarge scattered pieces
const COLORS = { ocean: '#7fb0d0', land: '#f4f1e6', border: '#8f897a', foreign: '#d8d5c9', prefecture: '#d9381e', island: '#7a35b0' };
// Minimum-size dot, in the World Map deck's on-screen sizes (px on a 1280 px wide desktop card). A target covering less
// than `under` px² on the main map is "small"; one that also fits in a `speck` px square gets the bigger dot.
const DOT = { under: 676, speck: 21, r: 5.2, speckR: 9.1, zoomR: 4 };
const R_KM = 6371;
const DEG_KM = (Math.PI * R_KM) / 180;
const FONT = "'Segoe UI', Arial, sans-serif";

const json = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const world = json('node_modules/world-atlas/countries-50m.json');
// Other countries (392 is Japan, drawn from the prefecture shapes instead). A few tiny islands in the atlas have
// zero-size rings that d3 reads as covering the whole globe, flooding the map, so those are dropped.
const foreign = feature(world, world.objects.countries).features.filter((f) => f.id !== '392' && f.geometry).map((f) => {
  if (f.geometry.type !== 'MultiPolygon') return f;
  const coordinates = f.geometry.coordinates.filter((c) => geoArea({ type: 'Polygon', coordinates: c }) < 2 * Math.PI);
  return { ...f, geometry: { type: 'MultiPolygon', coordinates } };
});
const topo = json('data/raw/mlit/prefectures.topojson');
const country = { type: 'Feature', properties: {}, geometry: rewind(merge(topo, topo.objects.prefectures.geometries)) };
country.geometry.coordinates = country.geometry.coordinates.filter((c) => geoArea({ type: 'Polygon', coordinates: c }) < 2 * Math.PI);
const prefectures = [...prefectureShapes.values()];
const LABELS = [['RUSSIA', [134.5, 47.0]], ['CHINA', [119.0, 36.5]], ['NORTH KOREA', [126.8, 40.0]], ['SOUTH KOREA', [127.9, 36.4]], ['TAIWAN', [120.9, 23.7]]];

// North-up frame of a fixed ground width: Mercator centred on [lon, lat], scaled so distances are true at the centre latitude.
const frame = ([lon, lat], km, w, h) => geoMercator().rotate([-lon, 0]).center([0, lat])
  .scale((w / km) * R_KM * Math.cos((lat * Math.PI) / 180)).translate([w / 2, h / 2])
  .clipExtent([[-20, -20], [w + 20, h + 20]]); // nothing outside the canvas is written to the SVG

// Drops vertices closer than `min` px to the previous kept one (sub-pixel detail nobody can see).
function thin(d, min = 0.5) {
  let px = 0, py = 0;
  return d.replace(/([MLZ])([^MLZ]*)/g, (m, c, rest) => {
    if (c === 'Z') return m;
    const [x, y] = rest.split(',').map(Number);
    if (c === 'L' && Math.hypot(x - px, y - py) < min) return '';
    px = x; py = y;
    return m;
  });
}

// Every part of the target smaller than a dot of radius r gets one, in the target's colour.
function dots(proj, target, colour, r) {
  const g = target.geometry;
  const gp = geoPath(proj);
  let out = '';
  for (const coordinates of g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates]) {
    const part = { type: 'Polygon', coordinates };
    if (gp.area(part) >= Math.PI * r * r) continue;
    const p = proj(geoCentroid(part));
    if (p) out += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${+r.toFixed(1)}" fill="${colour}"/>`;
  }
  return out;
}

function draw(kind, target, proj, w, h, { ui = 1, labels = false, dotR = 0 } = {}) {
  const path = geoPath(proj).digits(1);
  const d = (list) => thin(list.map((f) => path(f)).filter(Boolean).join(''));
  const colour = COLORS[kind];
  const backdrop = kind === 'prefecture' ? prefectures.filter((f) => f.id !== target.id) : [country];
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">`
    + `<rect width="${w}" height="${h}" fill="${COLORS.ocean}"/>`
    + `<path d="${d(foreign)}" fill="${COLORS.foreign}" stroke="${COLORS.border}" stroke-width="${0.8 * ui}"/>`
    + `<path d="${d(backdrop)}" fill="${COLORS.land}" stroke="${COLORS.border}" stroke-width="${0.8 * ui}" stroke-linejoin="round"/>`
    + `<path d="${d([target])}" fill="${colour}" stroke="${colour}" stroke-width="${0.6 * ui}" stroke-linejoin="round"/>`;
  if (dotR) svg += dots(proj, target, colour, dotR);
  if (labels) {
    for (const [text, at] of LABELS) {
      const p = proj(at);
      if (!p || p[0] < 0 || p[0] > w || p[1] < 0 || p[1] > h) continue;
      svg += `<text x="${p[0].toFixed(1)}" y="${p[1].toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="${17 * ui}" letter-spacing="${2.5 * ui}" fill="#27323c" fill-opacity="0.55">${text}</text>`;
    }
  }
  return svg + '</svg>';
}

// The part of a shape the view is framed on. For a prefecture: the big pieces near its largest one, so far-off islands
// do not pull the frame (Tokyo uses its mainland only). Islands are framed whole.
function mainLand(kind, f) {
  if (kind === 'island' || f.geometry.type !== 'MultiPolygon') return f.geometry;
  const parts = f.geometry.coordinates.map((coordinates) => ({ type: 'Polygon', coordinates }));
  const areas = parts.map((p) => geoArea(p));
  const big = areas.indexOf(Math.max(...areas));
  const centre = geoCentroid(parts[big]);
  const keep = parts.filter((p, i) => i === big
    || (f.id !== '13' && areas[i] >= areas[big] * 0.02 && geoDistance(geoCentroid(p), centre) * R_KM <= 200));
  return { type: 'MultiPolygon', coordinates: keep.map((p) => p.coordinates) };
}

// Centre of a shape's bounding box, in lon/lat, and its larger side in kilometres.
function extentOf(geom) {
  const [[west, south], [east, north]] = geoBounds(geom);
  const my = (l) => Math.log(Math.tan(Math.PI / 4 + (l * Math.PI) / 360));
  const lat = ((2 * Math.atan(Math.exp((my(south) + my(north)) / 2)) - Math.PI / 2) * 180) / Math.PI;
  const width = (east - west) * Math.cos((lat * Math.PI) / 180) * DEG_KM;
  const height = (north - south) * DEG_KM;
  return { centre: [(west + east) / 2, lat], width, height, km: Math.max(width, height) };
}

// Zoom box: the same drawing in a frame only a little wider than the target, with a scale bar. Returns null when the
// target is too spread out for one.
function drawZoom(kind, target, geom, w = 600, h = 480, share = 0.6) {
  const frameKm = (e) => Math.max(e.width / share, (e.height / share) * (w / h));
  // Spread is measured on the whole territory, far-off islands included.
  if (frameKm(extentOf(target.geometry)) > ZOOM_MAX_FRAME_KM) return null;
  const framed = extentOf(geom);
  const { centre } = framed;
  const km = frameKm(framed);
  const svg = draw(kind, target, frame(centre, km, w, h), w, h, { ui: 2, dotR: DOT.zoomR });
  // The longest round distance that fits in about a quarter of the width.
  const bar = [100, 50, 20, 10, 5, 2, 1].find((m) => m <= km / 4) || 1;
  const bx = 24, by = h - 30, bx1 = +(bx + (bar / km) * w).toFixed(1);
  const line = `M${bx} ${by - 8}V${by}H${bx1}V${by - 8}`;
  const font = `font-family="${FONT}" font-size="34" fill="#1d2a35" stroke="#ffffff" stroke-width="7" stroke-linejoin="round" paint-order="stroke"`;
  return svg.replace('</svg>', `<path d="${line}" fill="none" stroke="#ffffff" stroke-width="9"/><path d="${line}" fill="none" stroke="#1d2a35" stroke-width="5"/>`
    + `<text x="${bx}" y="${by - 16}" ${font}>${bar} km</text></svg>`);
}

const all = [
  ...PREFECTURES.map((p) => ({ key: p.code, name: p.romaji, id: `JP-${p.code}`, kind: 'prefecture', shape: prefectureShapes.get(p.code) })),
  ...ISLANDS.map((i) => ({ key: i.id, name: i.romaji, id: `JP-I-${i.id}`, kind: 'island', shape: islandShapes.get(i.id) })),
];
const only = process.argv.slice(2);
const BOX_FILE = 'build/fit/boxes.json';
const boxes = fs.existsSync(BOX_FILE) ? json(BOX_FILE) : {};
fs.mkdirSync('build/media', { recursive: true });
fs.mkdirSync('build/fit', { recursive: true });
const todo = all.filter((t) => !only.length || only.includes(t.key));
for (const t of todo) {
  const geom = mainLand(t.kind, t.shape);
  const { centre, km: extent } = extentOf(geom);
  const context = WIDE[t.key] ?? CONTEXT_KM;
  const canvas = Math.max(MIN_CANVAS_KM, Math.round(extent / SHARE), context + 1200);
  const proj = frame(centre, canvas, SIZE, SIZE);
  const [[x0, y0], [x1, y1]] = geoPath(proj).bounds(geom);
  // [left, top, right, bottom] of the target, and the share of the canvas that is `context` kilometres.
  boxes[t.id] = [x0, y0, x1, y1].map((v) => +(v / SIZE).toFixed(4)).concat(+(context / canvas).toFixed(4));
  const area = geoArea(t.shape) * R_KM * R_KM;
  const ui = (context / CONTEXT_KM) * (SIZE / canvas);
  const small = geoPath(proj).area(t.shape) < DOT.under * ui * ui;
  const [[sx0, sy0], [sx1, sy1]] = geoPath(proj).bounds(t.shape);
  const speck = small && Math.max(sx1 - sx0, sy1 - sy0) < DOT.speck * ui;
  const dotR = small ? (speck ? DOT.speckR : DOT.r) * ui : 0;
  const svg = draw(t.kind, t.shape, proj, SIZE, SIZE, { ui, labels: true, dotR });
  const stem = t.id.slice(3);
  fs.writeFileSync(`build/media/jp-map-${stem}.svg`, svg);
  const zoom = t.kind === 'island' && area < ZOOM_MAX_KM2 ? drawZoom(t.kind, t.shape, geom) : null;
  if (zoom) fs.writeFileSync(`build/media/jp-zoom-${stem}.svg`, zoom);
  else fs.rmSync(`build/media/jp-zoom-${stem}.svg`, { force: true });
  console.log(`${t.key.padEnd(12)} ${t.name.padEnd(20)} ${String(canvas).padStart(5)} km  ${String(Math.round(svg.length / 1024)).padStart(4)} KB${zoom ? '  + zoom' : ''}${small ? (speck ? '  + big dot' : '  + dot') : ''}`);
}
fs.writeFileSync(BOX_FILE, JSON.stringify(boxes));
console.log('rendered', todo.length, 'maps to build/media');
