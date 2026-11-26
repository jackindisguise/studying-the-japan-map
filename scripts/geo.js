// Shapes: the 47 prefectures (MLIT administrative boundaries, simplified to 1% by SmartNews Media Research Institute),
// their land borders (shared arcs), and the islands, which are cut out of the merged coastline.
import fs from 'node:fs';
import { feature, merge, neighbors } from 'topojson-client';
import { geoArea, geoContains, geoDistance } from 'd3-geo';

const dir = new URL('../', import.meta.url);
const read = (f) => JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8'));
const KM = 6371;

export const PREFECTURES = read('data/prefectures.json');
export const ISLANDS = read('data/islands.json');
const topo = read('data/raw/mlit/prefectures.topojson');
const geoms = topo.objects.prefectures.geometries;
const adj = neighbors(geoms);

// d3 wants exterior rings clockwise on the sphere: a polygon that "covers" more than half the globe is wound the wrong way.
export const rewind = (g) => {
  const flip = (poly) => (geoArea({ type: 'Polygon', coordinates: poly }) > 2 * Math.PI ? poly.map((r) => r.slice().reverse()) : poly);
  return g.type === 'MultiPolygon' ? { ...g, coordinates: g.coordinates.map(flip) } : { ...g, coordinates: flip(g.coordinates) };
};
// Tiny rings collapsed by the simplification have no area and would flood the map; they are dropped.
const solid = (g) => (g.type !== 'MultiPolygon' ? g : { ...g, coordinates: g.coordinates.filter((c) => geoArea({ type: 'Polygon', coordinates: c }) < 2 * Math.PI) });
const asFeature = (id, geometry) => ({ type: 'Feature', id, properties: {}, geometry: solid(rewind(geometry)) });

// The source lists the prefectures in JIS code order, the order of data/prefectures.json.
export const prefectureShapes = new Map(feature(topo, topo.objects.prefectures).features.map((f, i) => {
  const { code } = PREFECTURES[i];
  return [code, { ...asFeature(code, f.geometry), name: geoms[i].properties.N03_001 }];
}));

// Land borders with other prefectures, as codes. Prefectures linked only by bridges or tunnels do not count.
export const borders = (code) => adj[Number(code) - 1].map((j) => PREFECTURES[j].code);

// The coastline of the whole country, one polygon per landmass.
const landmasses = asFeature('japan', merge(topo, geoms)).geometry.coordinates.map((coordinates) => ({ type: 'Polygon', coordinates }));
export const islandShapes = new Map(ISLANDS.map((island) => {
  const parts = new Set(island.points.map((p) => {
    // The land under the point, or else (a point that falls in a bay) the nearest coast within 15 km.
    const found = landmasses.find((l) => geoContains(l, p));
    if (found) return found;
    const [near] = landmasses.map((l) => ({ l, km: Math.min(...l.coordinates[0].map((v) => geoDistance(v, p))) * KM })).sort((a, z) => a.km - z.km);
    if (near.km > 15) throw new Error(`${island.id}: no land at ${p}`);
    console.warn(`${island.id}: using the coast ${near.km.toFixed(1)} km from ${p}`);
    return near.l;
  }));
  const f = { type: 'Feature', id: island.id, properties: {}, geometry: { type: 'MultiPolygon', coordinates: [...parts].map((p) => p.coordinates) } };
  f.km2 = geoArea(f) * KM * KM;
  return [island.id, f];
}));
