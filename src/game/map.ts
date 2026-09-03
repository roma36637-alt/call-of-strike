import type { Vec, Team } from './types';

export const TILE = 48;

// Legend:
// # wall (building)   c crate   x sandbag   . concrete   , dirt   = road   ~ grass
// A team 0 spawn   B team 1 spawn   h health pickup   a ammo pickup   * hotspot
export const MAP_ROWS: string[] = [
  '############################################',
  '#A....~~~~~,......##......##......,~~~~~..B#',
  '#A....~~~~~,......#........#......,~~~~~..B#',
  '#.....~~~~~,.cc...#........#...cc.,~~~~~...#',
  '#.....~~~~~,.cc...##..##..##...cc.,~~~~~...#',
  '#.........x...........*...........x........#',
  '#..###.......c.....xx....xx.c.......###....#',
  '#..#.....a...c..............c...h.....#....#',
  '#..#....=========================.....#....#',
  '#.......=,,,,,,,,,,,,,,,,,,,,,,,=..........#',
  '#.......=,,,,###.......###,,,,,,=..........#',
  '#..cc...=,,,,#...........#,,,,,,=....cc....#',
  '#..cc...=,,,,#.....x.....#,,,,,,=....cc....#',
  '#...x...=,,,,#....h......#,,,,,,=...x......#',
  '#.......=,,,,###.......###,,,,,,=..........#',
  '#.##....=,,,,,,,,,,,*,,,,,,,,,,,=.....##...#',
  '#.##....=,,,,,,,,,,,,,,,,,,,,,,,=.....##...#',
  '#.......=,,,,###.......###,,,,,,=..........#',
  '#...x...=,,,,#....a......#,,,,,,=...x......#',
  '#..cc...=,,,,#.....x.....#,,,,,,=....cc....#',
  '#..cc...=,,,,#...........#,,,,,,=....cc....#',
  '#.......=,,,,###.......###,,,,,,=..........#',
  '#.......=,,,,,,,,,,,,,,,,,,,,,,,=..........#',
  '#..#....=========================.....#....#',
  '#..#.....h...c..............c...a.....#....#',
  '#..###.......c.....xx....xx.c.......###....#',
  '#.........x...........*...........x........#',
  '#.....~~~~~,.cc...##..##..##...cc.,~~~~~...#',
  '#.....~~~~~,.cc...#........#...cc.,~~~~~...#',
  '#A....~~~~~,......#........#......,~~~~~..B#',
  '#A....~~~~~,......##......##......,~~~~~..B#',
  '############################################',
];

export const MAP_W = MAP_ROWS[0].length;
export const MAP_H = MAP_ROWS.length;
export const WORLD_W = MAP_W * TILE;
export const WORLD_H = MAP_H * TILE;

export type TileKind = 'floor' | 'wall' | 'crate' | 'sandbag';

export interface MapData {
  solid: Uint8Array; // 1 = blocked
  kind: string[]; // raw char per cell
  spawns: [Vec[], Vec[]];
  pickups: { x: number; y: number; type: 'health' | 'ammo' }[];
  hotspots: Vec[];
}

export function parseMap(): MapData {
  const solid = new Uint8Array(MAP_W * MAP_H);
  const kind: string[] = new Array(MAP_W * MAP_H);
  const spawns: [Vec[], Vec[]] = [[], []];
  const pickups: MapData['pickups'] = [];
  const hotspots: Vec[] = [];
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const c = MAP_ROWS[y][x];
      const i = y * MAP_W + x;
      kind[i] = c;
      const cx = x * TILE + TILE / 2;
      const cy = y * TILE + TILE / 2;
      if (c === '#' || c === 'c' || c === 'x') solid[i] = 1;
      if (c === 'A') spawns[0].push({ x: cx, y: cy });
      if (c === 'B') spawns[1].push({ x: cx, y: cy });
      if (c === 'h') pickups.push({ x: cx, y: cy, type: 'health' });
      if (c === 'a') pickups.push({ x: cx, y: cy, type: 'ammo' });
      if (c === '*') hotspots.push({ x: cx, y: cy });
    }
  }
  // add a few extra hotspots around pickups & lanes
  for (const p of pickups) hotspots.push({ x: p.x, y: p.y });
  hotspots.push({ x: 10 * TILE, y: 16 * TILE }, { x: 34 * TILE, y: 16 * TILE });
  hotspots.push({ x: 22 * TILE, y: 8.5 * TILE }, { x: 22 * TILE, y: 23.5 * TILE });
  return { solid, kind, spawns, pickups, hotspots };
}

export function isSolid(map: MapData, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
  return map.solid[ty * MAP_W + tx] === 1;
}

export function solidAt(map: MapData, x: number, y: number): boolean {
  return isSolid(map, Math.floor(x / TILE), Math.floor(y / TILE));
}

/** Resolve circle vs. tile grid collision; mutates position. */
export function resolveCircle(map: MapData, p: { x: number; y: number }, r: number): void {
  const minTx = Math.floor((p.x - r) / TILE);
  const maxTx = Math.floor((p.x + r) / TILE);
  const minTy = Math.floor((p.y - r) / TILE);
  const maxTy = Math.floor((p.y + r) / TILE);
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (!isSolid(map, tx, ty)) continue;
      const bx = tx * TILE;
      const by = ty * TILE;
      const cx = Math.max(bx, Math.min(p.x, bx + TILE));
      const cy = Math.max(by, Math.min(p.y, by + TILE));
      let dx = p.x - cx;
      let dy = p.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < r * r) {
        if (d2 < 0.0001) {
          // center inside the tile; push out along smallest axis
          const left = p.x - bx;
          const right = bx + TILE - p.x;
          const top = p.y - by;
          const bottom = by + TILE - p.y;
          const m = Math.min(left, right, top, bottom);
          if (m === left) p.x = bx - r;
          else if (m === right) p.x = bx + TILE + r;
          else if (m === top) p.y = by - r;
          else p.y = by + TILE + r;
        } else {
          const d = Math.sqrt(d2);
          dx /= d;
          dy /= d;
          p.x = cx + dx * r;
          p.y = cy + dy * r;
        }
      }
    }
  }
}

/** DDA raycast for line of sight. Returns true if clear. */
export function losClear(map: MapData, x0: number, y0: number, x1: number, y1: number): boolean {
  return raycast(map, x0, y0, x1, y1) === null;
}

/** Returns hit point or null if no wall between points. */
export function raycast(map: MapData, x0: number, y0: number, x1: number, y1: number): Vec | null {
  let tx = Math.floor(x0 / TILE);
  let ty = Math.floor(y0 / TILE);
  const tx1 = Math.floor(x1 / TILE);
  const ty1 = Math.floor(y1 / TILE);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(TILE / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(TILE / dy) : Infinity;
  let tMaxX = dx !== 0 ? (dx > 0 ? ((tx + 1) * TILE - x0) / dx : (tx * TILE - x0) / dx) : Infinity;
  let tMaxY = dy !== 0 ? (dy > 0 ? ((ty + 1) * TILE - y0) / dy : (ty * TILE - y0) / dy) : Infinity;
  if (isSolid(map, tx, ty)) return { x: x0, y: y0 };
  let guard = 0;
  while ((tx !== tx1 || ty !== ty1) && guard++ < 400) {
    let t: number;
    if (tMaxX < tMaxY) {
      t = tMaxX;
      tMaxX += tDeltaX;
      tx += stepX;
    } else {
      t = tMaxY;
      tMaxY += tDeltaY;
      ty += stepY;
    }
    if (t > 1) break;
    if (isSolid(map, tx, ty)) {
      return { x: x0 + dx * t, y: y0 + dy * t };
    }
  }
  return null;
}

/** Wider LOS for movement (checks two parallel rays offset by radius) */
export function pathClear(map: MapData, x0: number, y0: number, x1: number, y1: number, r: number): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const d = Math.hypot(dx, dy) || 1;
  const nx = (-dy / d) * r;
  const ny = (dx / d) * r;
  return (
    losClear(map, x0 + nx, y0 + ny, x1 + nx, y1 + ny) &&
    losClear(map, x0 - nx, y0 - ny, x1 - nx, y1 - ny) &&
    losClear(map, x0, y0, x1, y1)
  );
}

// ---------- A* pathfinding ----------
const DIRS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, 1.414],
  [-1, 1, 1.414],
  [1, -1, 1.414],
  [-1, -1, 1.414],
];

class MinHeap {
  a: { i: number; f: number }[] = [];
  push(i: number, f: number) {
    const a = this.a;
    a.push({ i, f });
    let n = a.length - 1;
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (a[p].f <= a[n].f) break;
      [a[p], a[n]] = [a[n], a[p]];
      n = p;
    }
  }
  pop(): { i: number; f: number } | undefined {
    const a = this.a;
    if (a.length === 0) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let n = 0;
      for (;;) {
        const l = n * 2 + 1;
        const r = l + 1;
        let m = n;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === n) break;
        [a[m], a[n]] = [a[n], a[m]];
        n = m;
      }
    }
    return top;
  }
  get size() {
    return this.a.length;
  }
}

const gScore = new Float32Array(MAP_W * MAP_H);
const cameFrom = new Int32Array(MAP_W * MAP_H);
const closed = new Uint8Array(MAP_W * MAP_H);

export function findPath(map: MapData, from: Vec, to: Vec): Vec[] {
  let sx = Math.floor(from.x / TILE);
  let sy = Math.floor(from.y / TILE);
  let ex = Math.floor(to.x / TILE);
  let ey = Math.floor(to.y / TILE);
  const fix = (x: number, y: number): [number, number] => {
    if (!isSolid(map, x, y)) return [x, y];
    for (let r = 1; r < 4; r++) {
      for (let oy = -r; oy <= r; oy++)
        for (let ox = -r; ox <= r; ox++) if (!isSolid(map, x + ox, y + oy)) return [x + ox, y + oy];
    }
    return [x, y];
  };
  [sx, sy] = fix(sx, sy);
  [ex, ey] = fix(ex, ey);
  const start = sy * MAP_W + sx;
  const goal = ey * MAP_W + ex;
  if (start === goal) return [{ x: to.x, y: to.y }];

  gScore.fill(Infinity);
  closed.fill(0);
  cameFrom.fill(-1);
  const heap = new MinHeap();
  gScore[start] = 0;
  const h = (i: number) => {
    const x = i % MAP_W;
    const y = (i / MAP_W) | 0;
    const dx = Math.abs(x - ex);
    const dy = Math.abs(y - ey);
    return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
  };
  heap.push(start, h(start));
  let found = false;
  let iter = 0;
  while (heap.size > 0 && iter++ < 6000) {
    const cur = heap.pop()!.i;
    if (cur === goal) {
      found = true;
      break;
    }
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % MAP_W;
    const cy = (cur / MAP_W) | 0;
    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (isSolid(map, nx, ny)) continue;
      // prevent corner cutting
      if (dx !== 0 && dy !== 0 && (isSolid(map, cx + dx, cy) || isSolid(map, cx, cy + dy))) continue;
      const ni = ny * MAP_W + nx;
      if (closed[ni]) continue;
      // prefer staying away from walls slightly
      let extra = 0;
      if (isSolid(map, nx + 1, ny) || isSolid(map, nx - 1, ny) || isSolid(map, nx, ny + 1) || isSolid(map, nx, ny - 1))
        extra = 0.35;
      const g = gScore[cur] + cost + extra;
      if (g < gScore[ni]) {
        gScore[ni] = g;
        cameFrom[ni] = cur;
        heap.push(ni, g + h(ni));
      }
    }
  }
  if (!found) return [];
  const path: Vec[] = [];
  let c = goal;
  while (c !== start && c !== -1) {
    path.push({ x: (c % MAP_W) * TILE + TILE / 2, y: ((c / MAP_W) | 0) * TILE + TILE / 2 });
    c = cameFrom[c];
  }
  path.reverse();
  if (path.length) path[path.length - 1] = { x: to.x, y: to.y };
  return path;
}

export function randomFloorPoint(map: MapData, rnd: () => number): Vec {
  for (let i = 0; i < 100; i++) {
    const tx = 1 + Math.floor(rnd() * (MAP_W - 2));
    const ty = 1 + Math.floor(rnd() * (MAP_H - 2));
    if (!isSolid(map, tx, ty)) return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
  }
  return { x: WORLD_W / 2, y: WORLD_H / 2 };
}

export function teamColor(team: Team, alpha = 1): string {
  return team === 0 ? `rgba(56,189,248,${alpha})` : `rgba(255,77,77,${alpha})`;
}
