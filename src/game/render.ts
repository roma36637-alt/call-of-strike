import type { Game, Decal } from './engine';
import type { Soldier, Particle, InputState } from './types';
import { MAP_W, MAP_H, TILE, WORLD_W, WORLD_H, isSolid, type MapData } from './map';

const TEAM = ['#38bdf8', '#ff4d4d'];
const TEAM_DARK = ['#1d5f80', '#8a1f1f'];
const SKINS = [
  ['#4b5563', '#374151'],
  ['#4d5a3f', '#3a4530'],
  ['#5b524a', '#443d37'],
];

function hash(x: number, y: number) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

export class Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  mapCanvas: HTMLCanvasElement;
  mapCtx: CanvasRenderingContext2D;
  miniCanvas: HTMLCanvasElement;
  vignette: HTMLCanvasElement | null = null;
  w = 0;
  h = 0;
  dpr = 1;
  time = 0;

  constructor(canvas: HTMLCanvasElement, map: MapData) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.mapCanvas = document.createElement('canvas');
    this.mapCanvas.width = WORLD_W;
    this.mapCanvas.height = WORLD_H;
    this.mapCtx = this.mapCanvas.getContext('2d')!;
    this.miniCanvas = document.createElement('canvas');
    this.prerenderMap(map);
    this.prerenderMini(map);
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    const isMobile = Math.min(w, h) < 500;
    this.dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2);
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    // vignette
    const v = document.createElement('canvas');
    v.width = Math.floor(w / 2);
    v.height = Math.floor(h / 2);
    const vc = v.getContext('2d')!;
    const g = vc.createRadialGradient(v.width / 2, v.height / 2, Math.min(v.width, v.height) * 0.35, v.width / 2, v.height / 2, Math.max(v.width, v.height) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.6)');
    vc.fillStyle = g;
    vc.fillRect(0, 0, v.width, v.height);
    this.vignette = v;
  }

  // ---------- static map ----------
  prerenderMap(map: MapData) {
    const c = this.mapCtx;
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H ? '#' : map.kind[y * MAP_W + x]);
    // floors
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const k = at(x, y);
        const px = x * TILE;
        const py = y * TILE;
        const r = hash(x, y);
        let base = '#3a3f47';
        if (k === ',') base = '#584634';
        else if (k === '~') base = '#3d5a2e';
        else if (k === '=') base = '#2b2e33';
        c.fillStyle = base;
        c.fillRect(px, py, TILE, TILE);
        // variation
        c.fillStyle = `rgba(0,0,0,${0.03 + r * 0.07})`;
        c.fillRect(px, py, TILE, TILE);
        if (k === '.' || k === 'A' || k === 'B' || k === 'h' || k === 'a' || k === '*') {
          // concrete slabs
          c.strokeStyle = 'rgba(0,0,0,0.18)';
          c.lineWidth = 1;
          c.strokeRect(px + 0.5, py + 0.5, TILE, TILE);
          if (r > 0.75) {
            c.fillStyle = 'rgba(0,0,0,0.12)';
            c.beginPath();
            c.moveTo(px + r * 40, py + 5);
            c.lineTo(px + 10 + r * 20, py + 25 + r * 10);
            c.lineTo(px + 30, py + 44);
            c.lineWidth = 1;
            c.strokeStyle = 'rgba(0,0,0,0.25)';
            c.stroke();
          }
        } else if (k === ',') {
          for (let i = 0; i < 6; i++) {
            const rx = hash(x * 7 + i, y * 13);
            const ry = hash(x * 3, y * 11 + i);
            c.fillStyle = rx > 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,220,160,0.08)';
            c.fillRect(px + rx * 44, py + ry * 44, 3, 2);
          }
        } else if (k === '~') {
          for (let i = 0; i < 8; i++) {
            const rx = hash(x * 5 + i, y * 17);
            const ry = hash(x * 9, y * 5 + i);
            c.fillStyle = rx > 0.5 ? 'rgba(120,180,80,0.18)' : 'rgba(0,0,0,0.15)';
            c.fillRect(px + rx * 44, py + ry * 44, 2, 4);
          }
        } else if (k === '=') {
          const horiz = at(x - 1, y) === '=' && at(x + 1, y) === '=';
          const vert = at(x, y - 1) === '=' && at(x, y + 1) === '=';
          c.fillStyle = 'rgba(255,200,60,0.55)';
          if (horiz && !vert) c.fillRect(px + 6, py + TILE / 2 - 1.5, 28, 3);
          else if (vert && !horiz) c.fillRect(px + TILE / 2 - 1.5, py + 6, 3, 28);
          // cracks
          if (r > 0.8) {
            c.fillStyle = 'rgba(0,0,0,0.25)';
            c.fillRect(px + r * 30, py + 20, 12, 1);
          }
        }
      }
    }
    // spawn zone markers
    for (let t = 0; t < 2; t++) {
      for (const s of map.spawns[t]) {
        c.strokeStyle = t === 0 ? 'rgba(56,189,248,0.25)' : 'rgba(255,77,77,0.25)';
        c.lineWidth = 2;
        c.strokeRect(s.x - TILE / 2 + 4, s.y - TILE / 2 + 4, TILE - 8, TILE - 8);
      }
    }
    // shadows of solids
    c.fillStyle = 'rgba(0,0,0,0.35)';
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        if (!isSolid(map, x, y)) continue;
        const k = at(x, y);
        const off = k === '#' ? 10 : 6;
        c.fillRect(x * TILE + off, y * TILE + off, TILE, TILE);
      }
    // solids
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const k = at(x, y);
        const px = x * TILE;
        const py = y * TILE;
        if (k === '#') {
          // side face
          c.fillStyle = '#23262c';
          c.fillRect(px, py, TILE, TILE);
          // top face (offset up-left slightly for 2.5D)
          c.fillStyle = '#5f6672';
          c.fillRect(px - 2, py - 6, TILE, TILE);
          c.fillStyle = 'rgba(255,255,255,0.05)';
          c.fillRect(px - 2, py - 6, TILE, 3);
          c.fillRect(px - 2, py - 6, 3, TILE);
          // edges where neighbor is not wall
          c.fillStyle = 'rgba(0,0,0,0.25)';
          if (at(x, y + 1) !== '#') c.fillRect(px - 2, py + TILE - 8, TILE, 2);
          if (at(x + 1, y) !== '#') c.fillRect(px + TILE - 4, py - 6, 2, TILE);
          // rooftop details
          const r = hash(x * 3, y * 7);
          if (r > 0.85) {
            c.fillStyle = '#4a505b';
            c.fillRect(px + 8, py + 6, 16, 16);
            c.fillStyle = '#6f7784';
            c.fillRect(px + 10, py + 8, 12, 12);
          }
        } else if (k === 'c') {
          const i = 4;
          c.fillStyle = '#6b4a2b';
          c.fillRect(px + i, py + i - 4, TILE - i * 2, TILE - i * 2);
          c.fillStyle = '#8a5f36';
          c.fillRect(px + i + 2, py + i - 2, TILE - i * 2 - 4, TILE - i * 2 - 4);
          c.strokeStyle = 'rgba(0,0,0,0.35)';
          c.lineWidth = 2;
          c.beginPath();
          c.moveTo(px + i + 2, py + i - 2);
          c.lineTo(px + TILE - i - 2, py + TILE - i - 6);
          c.moveTo(px + TILE - i - 2, py + i - 2);
          c.lineTo(px + i + 2, py + TILE - i - 6);
          c.stroke();
          c.strokeStyle = 'rgba(0,0,0,0.5)';
          c.strokeRect(px + i + 1, py + i - 3, TILE - i * 2 - 2, TILE - i * 2 - 2);
        } else if (k === 'x') {
          // sandbags
          for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 2; col++) {
              const bx = px + 5 + col * 20 + (row % 2) * 8;
              const by = py + 4 + row * 13;
              c.fillStyle = row === 1 ? '#a3906a' : '#b8a479';
              c.beginPath();
              c.roundRect(bx, by, 18, 12, 6);
              c.fill();
              c.strokeStyle = 'rgba(0,0,0,0.35)';
              c.lineWidth = 1;
              c.stroke();
            }
          }
        }
      }
    }
    // border fade
    c.fillStyle = 'rgba(0,0,0,0.5)';
    c.fillRect(0, 0, WORLD_W, TILE);
    c.fillRect(0, WORLD_H - TILE, WORLD_W, TILE);
    c.fillRect(0, 0, TILE, WORLD_H);
    c.fillRect(WORLD_W - TILE, 0, TILE, WORLD_H);
  }

  prerenderMini(map: MapData) {
    const sc = 4;
    this.miniCanvas.width = MAP_W * sc;
    this.miniCanvas.height = MAP_H * sc;
    const c = this.miniCanvas.getContext('2d')!;
    c.fillStyle = 'rgba(20,26,34,0.85)';
    c.fillRect(0, 0, this.miniCanvas.width, this.miniCanvas.height);
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        const k = map.kind[y * MAP_W + x];
        if (k === '#') c.fillStyle = 'rgba(200,210,220,0.85)';
        else if (k === 'c' || k === 'x') c.fillStyle = 'rgba(160,140,100,0.8)';
        else if (k === '=') c.fillStyle = 'rgba(70,75,85,0.6)';
        else continue;
        c.fillRect(x * sc, y * sc, sc, sc);
      }
  }

  // ---------- decals baked into map ----------
  applyDecals(decals: Decal[]) {
    if (!decals.length) return;
    const c = this.mapCtx;
    for (const d of decals) {
      switch (d.type) {
        case 'hole':
          c.fillStyle = 'rgba(15,15,18,0.75)';
          c.beginPath();
          c.arc(d.x, d.y, d.size, 0, 6.283);
          c.fill();
          c.fillStyle = 'rgba(0,0,0,0.25)';
          c.beginPath();
          c.arc(d.x, d.y, d.size * 1.8, 0, 6.283);
          c.fill();
          break;
        case 'blood':
          c.fillStyle = 'rgba(120,10,18,0.55)';
          c.beginPath();
          c.ellipse(d.x, d.y, d.size, d.size * 0.6, d.angle, 0, 6.283);
          c.fill();
          for (let i = 0; i < 3; i++) {
            c.beginPath();
            c.arc(d.x + Math.cos(d.angle + i) * d.size * 1.3, d.y + Math.sin(d.angle + i) * d.size * 1.3, d.size * 0.3, 0, 6.283);
            c.fill();
          }
          break;
        case 'scorch': {
          const g = c.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.size);
          g.addColorStop(0, 'rgba(10,8,6,0.85)');
          g.addColorStop(0.6, 'rgba(20,16,12,0.5)');
          g.addColorStop(1, 'rgba(0,0,0,0)');
          c.fillStyle = g;
          c.beginPath();
          c.arc(d.x, d.y, d.size, 0, 6.283);
          c.fill();
          break;
        }
        case 'casing':
          c.save();
          c.translate(d.x, d.y);
          c.rotate(d.angle);
          c.fillStyle = 'rgba(200,170,90,0.7)';
          c.fillRect(-d.size, -1, d.size * 2, 2);
          c.restore();
          break;
        case 'corpse': {
          c.save();
          c.translate(d.x, d.y);
          // blood pool
          c.fillStyle = 'rgba(110,8,16,0.6)';
          c.beginPath();
          c.ellipse(0, 0, d.size * 1.6, d.size * 1.2, d.angle, 0, 6.283);
          c.fill();
          c.rotate(d.angle);
          c.globalAlpha = 0.9;
          const skin = SKINS[d.skin ?? 0];
          // body lying
          c.fillStyle = skin[1];
          c.beginPath();
          c.ellipse(-4, 0, d.size * 1.1, d.size * 0.7, 0, 0, 6.283);
          c.fill();
          c.fillStyle = TEAM_DARK[d.team ?? 0];
          c.beginPath();
          c.ellipse(-4, 0, d.size * 0.7, d.size * 0.45, 0, 0, 6.283);
          c.fill();
          // helmet
          c.fillStyle = skin[0];
          c.beginPath();
          c.arc(d.size * 0.9, 2, d.size * 0.6, 0, 6.283);
          c.fill();
          c.restore();
          break;
        }
      }
    }
    decals.length = 0;
  }

  // ---------- frame ----------
  render(game: Game, input: InputState, dt: number) {
    this.time += dt;
    const ctx = this.ctx;
    const { w, h } = this;
    this.applyDecals(game.decals);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#0b0f14';
    ctx.fillRect(0, 0, w, h);

    const cam = game.cam;
    const zoom = cam.zoom;
    const cx = cam.x + game.shakeX;
    const cy = cam.y + game.shakeY;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-cx, -cy);

    // visible world rect
    const vw = w / zoom;
    const vh = h / zoom;
    const vx = Math.max(0, cx - vw / 2 - 20);
    const vy = Math.max(0, cy - vh / 2 - 20);
    const vx2 = Math.min(WORLD_W, cx + vw / 2 + 20);
    const vy2 = Math.min(WORLD_H, cy + vh / 2 + 20);
    ctx.drawImage(this.mapCanvas, vx, vy, vx2 - vx, vy2 - vy, vx, vy, vx2 - vx, vy2 - vy);

    const inView = (x: number, y: number, m = 60) => x > vx - m && x < vx2 + m && y > vy - m && y < vy2 + m;

    // airstrike markers
    for (const a of game.airstrikes) {
      if (a.t > 2.2) continue;
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 12);
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(a.angle);
      ctx.strokeStyle = `rgba(255,77,77,${0.4 + pulse * 0.5})`;
      ctx.lineWidth = 3;
      ctx.setLineDash([16, 12]);
      ctx.beginPath();
      ctx.moveTo(-340, 0);
      ctx.lineTo(340, 0);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(0, 0, 30 + pulse * 10, 0, 6.283);
      ctx.stroke();
      ctx.restore();
    }

    // pickups
    for (const pk of game.pickups) {
      if (!pk.active || !inView(pk.x, pk.y)) continue;
      const bob = Math.sin(pk.bob) * 3;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(pk.x, pk.y + 8, 12, 5, 0, 0, 6.283);
      ctx.fill();
      ctx.save();
      ctx.translate(pk.x, pk.y + bob);
      const glow = pk.type === 'health' ? 'rgba(74,222,128,' : 'rgba(255,183,43,';
      const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 26);
      g.addColorStop(0, glow + '0.35)');
      g.addColorStop(1, glow + '0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, 6.283);
      ctx.fill();
      if (pk.type === 'health') {
        ctx.fillStyle = '#e8f5e9';
        ctx.beginPath();
        ctx.roundRect(-10, -8, 20, 16, 3);
        ctx.fill();
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(-2, -6, 4, 12);
        ctx.fillRect(-6, -2, 12, 4);
      } else {
        ctx.fillStyle = '#4b5320';
        ctx.beginPath();
        ctx.roundRect(-11, -8, 22, 16, 3);
        ctx.fill();
        ctx.fillStyle = '#ffb72b';
        ctx.fillRect(-7, -4, 3, 8);
        ctx.fillRect(-2, -4, 3, 8);
        ctx.fillRect(3, -4, 3, 8);
      }
      ctx.restore();
    }

    // grenades
    for (const g of game.grenades) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(g.x, g.y, 6, 3, 0, 0, 6.283);
      ctx.fill();
      ctx.save();
      ctx.translate(g.x, g.y - g.z * 0.6);
      ctx.rotate(g.rot);
      ctx.fillStyle = '#2f3a2a';
      ctx.beginPath();
      ctx.ellipse(0, 0, 6, 4.5, 0, 0, 6.283);
      ctx.fill();
      ctx.fillStyle = '#8a8f7a';
      ctx.fillRect(3, -2, 3, 4);
      if (Math.sin(this.time * 25) > 0) {
        ctx.fillStyle = '#ff4d4d';
        ctx.beginPath();
        ctx.arc(-1, -1, 1.6, 0, 6.283);
        ctx.fill();
      }
      ctx.restore();
    }

    // soldiers
    for (const s of game.soldiers) {
      if (!s.alive || !inView(s.x, s.y)) continue;
      this.drawSoldier(ctx, s, game);
    }

    // bullets (additive)
    ctx.globalCompositeOperation = 'lighter';
    for (const b of game.bullets) {
      if (!inView(b.x, b.y, 120)) continue;
      const sp = Math.hypot(b.vx, b.vy) || 1;
      const nx = b.vx / sp;
      const ny = b.vy / sp;
      const tx = b.x - nx * b.len;
      const ty = b.y - ny * b.len;
      const grad = ctx.createLinearGradient(tx, ty, b.x, b.y);
      grad.addColorStop(0, 'rgba(255,200,100,0)');
      grad.addColorStop(1, b.color);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 4;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(b.x - nx * b.len * 0.5, b.y - ny * b.len * 0.5);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';

    // particles
    this.drawParticles(ctx, game.particles, inView);

    // floating text
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of game.floats) {
      const a = Math.min(1, f.life * 2.5);
      ctx.globalAlpha = a;
      ctx.font = `700 ${f.size}px Rajdhani, sans-serif`;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(f.text, f.x + 1, f.y + 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    // touch aim line
    if (input.touch && game.player.alive && input.aimActive) {
      const p = game.player;
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.moveTo(p.x + Math.cos(p.angle) * 30, p.y + Math.sin(p.angle) * 30);
      ctx.lineTo(p.x + Math.cos(p.angle) * 260, p.y + Math.sin(p.angle) * 260);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();

    // ---------- screen space ----------
    // muzzle light flash (global brighten)
    if (game.flashLight > 0) {
      ctx.fillStyle = `rgba(255,230,180,${game.flashLight * 0.035})`;
      ctx.fillRect(0, 0, w, h);
    }
    if (this.vignette) ctx.drawImage(this.vignette, 0, 0, w, h);

    const p = game.player;
    // hurt indicator
    if (game.hurtT > 0) {
      const a = game.hurtT / 0.6;
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(game.hurtAngle);
      const r = Math.min(w, h) * 0.3;
      const g = ctx.createRadialGradient(r, 0, 0, r, 0, r * 0.9);
      g.addColorStop(0, `rgba(255,30,30,${0.55 * a})`);
      g.addColorStop(1, 'rgba(255,30,30,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.3, -0.7, 0.7);
      ctx.lineTo(0, 0);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = `rgba(200,0,0,${0.18 * a})`;
      ctx.fillRect(0, 0, w, h);
    }
    // low hp pulse
    if (p.alive && p.hp < 40) {
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 6);
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
      g.addColorStop(0, 'rgba(160,0,0,0)');
      g.addColorStop(1, `rgba(160,0,0,${(0.25 + pulse * 0.3) * (1 - p.hp / 40)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    // death overlay
    if (!p.alive) {
      ctx.fillStyle = 'rgba(40,0,0,0.35)';
      ctx.fillRect(0, 0, w, h);
    }

    // crosshair + hitmarker
    let chx = w / 2;
    let chy = h / 2;
    if (!input.touch) {
      chx = input.mouseX;
      chy = input.mouseY;
    } else {
      const sx = (p.x - cx) * zoom + w / 2;
      const sy = (p.y - cy) * zoom + h / 2;
      chx = sx + Math.cos(p.angle) * 120 * zoom;
      chy = sy + Math.sin(p.angle) * 120 * zoom;
    }
    if (p.alive) {
      const wdef = p.weapons[p.cur].def;
      const moving = Math.hypot(p.vx, p.vy) > 40;
      const gap = 8 + wdef.spread * 120 + (moving ? 6 : 0) + p.kick * 0.6;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 3;
      ctx.beginPath();
      const L = 7;
      ctx.moveTo(chx - gap - L, chy);
      ctx.lineTo(chx - gap, chy);
      ctx.moveTo(chx + gap + L, chy);
      ctx.lineTo(chx + gap, chy);
      ctx.moveTo(chx, chy - gap - L);
      ctx.lineTo(chx, chy - gap);
      ctx.moveTo(chx, chy + gap + L);
      ctx.lineTo(chx, chy + gap);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(chx - 1, chy - 1, 2, 2);
      ctx.shadowBlur = 0;
    }
    if (game.hitMarkerT > 0) {
      const a = Math.min(1, game.hitMarkerT * 6);
      const sz = game.hitMarkerKill ? 14 : 10;
      ctx.strokeStyle = game.hitMarkerKill ? `rgba(255,60,60,${a})` : `rgba(255,255,255,${a})`;
      ctx.lineWidth = game.hitMarkerKill ? 3 : 2;
      ctx.beginPath();
      for (const [dx, dy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        ctx.moveTo(chx + dx * 5, chy + dy * 5);
        ctx.lineTo(chx + dx * sz, chy + dy * sz);
      }
      ctx.stroke();
    }

    this.drawMinimap(ctx, game);
  }

  drawSoldier(ctx: CanvasRenderingContext2D, s: Soldier, game: Game) {
    const team = TEAM[s.team];
    const skin = SKINS[s.skin];
    const w = s.weapons[s.cur].def;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(s.x + 4, s.y + 6, s.radius + 2, s.radius - 2, 0, 0, 6.283);
    ctx.fill();

    ctx.save();
    ctx.translate(s.x, s.y);
    // player ring
    if (s.isPlayer) {
      ctx.strokeStyle = 'rgba(255,183,43,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, s.radius + 6, 0, 6.283);
      ctx.stroke();
    }
    ctx.rotate(s.angle);
    // legs
    const step = s.moving ? Math.sin(s.walk * 2.2) * 7 : 0;
    ctx.fillStyle = skin[1];
    ctx.beginPath();
    ctx.roundRect(-6 + step, -9, 12, 7, 3);
    ctx.roundRect(-6 - step, 2, 12, 7, 3);
    ctx.fill();
    // gun (with kick)
    const kick = -s.kick * 0.3;
    const gy = 7; // right-hand offset
    ctx.fillStyle = '#1b1e23';
    ctx.fillRect(2 + kick, gy - w.width / 2, w.length, w.width);
    ctx.fillStyle = '#3a3f47';
    ctx.fillRect(2 + kick, gy - w.width / 2, w.length * 0.45, w.width * 0.5);
    if (w.id === 'sniper') {
      ctx.fillStyle = '#111';
      ctx.fillRect(8 + kick, gy - w.width / 2 - 3, 12, 3);
    }
    if (w.id === 'lmg') {
      ctx.fillStyle = '#2b2f36';
      ctx.fillRect(6 + kick, gy + 2, 10, 7);
    }
    if (w.id === 'shotgun') {
      ctx.fillStyle = '#5a3a1e';
      ctx.fillRect(2 + kick, gy - 2, 12, 4);
    }
    // body
    ctx.fillStyle = skin[0];
    ctx.beginPath();
    ctx.arc(0, 0, s.radius, 0, 6.283);
    ctx.fill();
    // vest / team stripe
    ctx.fillStyle = team;
    ctx.beginPath();
    ctx.roundRect(-9, -7, 12, 14, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-9, -1, 12, 2);
    // arms / hands
    ctx.fillStyle = skin[0];
    ctx.beginPath();
    ctx.arc(10 + kick, gy - 1, 4.5, 0, 6.283);
    ctx.arc(w.length * 0.55 + kick, gy, 4, 0, 6.283);
    ctx.fill();
    // shoulders outline
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, s.radius, 0, 6.283);
    ctx.stroke();
    // helmet
    ctx.fillStyle = skin[1];
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, 6.283);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.arc(-2, -2, 6, 0, 6.283);
    ctx.fill();
    // visor / team dot
    ctx.fillStyle = team;
    ctx.fillRect(4, -3, 4, 6);
    // hit flash
    if (s.hitFlash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,255,255,${s.hitFlash * 0.7})`;
      ctx.beginPath();
      ctx.arc(0, 0, s.radius, 0, 6.283);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();

    // reload indicator
    if (s.reloading) {
      const prog = 1 - s.reloadT / w.reload;
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius + 10, 0, 6.283);
      ctx.stroke();
      ctx.strokeStyle = s.isPlayer ? '#ffb72b' : 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius + 10, -Math.PI / 2, -Math.PI / 2 + prog * 6.283);
      ctx.stroke();
    }

    // name + hp
    const showInfo = s.isPlayer ? false : s.team === 0 || game.time - s.lastDamageT < 3 || game.uavT > 0;
    if (showInfo) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.font = '600 11px Rajdhani, sans-serif';
      ctx.fillStyle = s.team === 0 ? 'rgba(56,189,248,0.9)' : 'rgba(255,90,90,0.95)';
      ctx.fillText(s.name.toUpperCase(), s.x, s.y - s.radius - 12);
      if (s.hp < s.maxHp) {
        const bw = 30;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(s.x - bw / 2, s.y - s.radius - 10, bw, 4);
        ctx.fillStyle = s.team === 0 ? '#38bdf8' : '#ff4d4d';
        ctx.fillRect(s.x - bw / 2, s.y - s.radius - 10, (bw * s.hp) / s.maxHp, 4);
      }
    }
  }

  drawParticles(ctx: CanvasRenderingContext2D, ps: Particle[], inView: (x: number, y: number, m?: number) => boolean) {
    // non-additive first
    for (const p of ps) {
      if (!inView(p.x, p.y)) continue;
      const t = p.life / p.maxLife;
      switch (p.type) {
        case 'smoke':
          ctx.globalAlpha = t * 0.8;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, 6.283);
          ctx.fill();
          break;
        case 'blood':
          ctx.globalAlpha = Math.min(1, t * 1.5);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (0.6 + t * 0.4), 0, 6.283);
          ctx.fill();
          break;
        case 'shell':
        case 'debris':
          ctx.globalAlpha = 1;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size, -1, p.size * 2, p.type === 'shell' ? 2 : 3);
          ctx.restore();
          break;
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'lighter';
    for (const p of ps) {
      if (!inView(p.x, p.y, 200)) continue;
      const t = p.life / p.maxLife;
      switch (p.type) {
        case 'spark': {
          ctx.globalAlpha = t;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02);
          ctx.stroke();
          break;
        }
        case 'fire': {
          ctx.globalAlpha = t * 0.9;
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, Math.max(1, p.size));
          g.addColorStop(0, '#fff2b0');
          g.addColorStop(0.4, p.color);
          g.addColorStop(1, 'rgba(255,60,0,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(1, p.size), 0, 6.283);
          ctx.fill();
          break;
        }
        case 'flash': {
          ctx.globalAlpha = t;
          const r = p.size * 3;
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
          g.addColorStop(0, 'rgba(255,240,200,0.9)');
          g.addColorStop(0.2, 'rgba(255,200,100,0.5)');
          g.addColorStop(1, 'rgba(255,150,50,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, 6.283);
          ctx.fill();
          // star
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = 'rgba(255,250,220,0.95)';
          ctx.beginPath();
          ctx.moveTo(0, -p.size * 0.35);
          ctx.lineTo(p.size, 0);
          ctx.lineTo(0, p.size * 0.35);
          ctx.lineTo(-p.size * 0.2, 0);
          ctx.fill();
          ctx.restore();
          break;
        }
        case 'ring': {
          const r = p.size * (1 - t) + 4;
          ctx.globalAlpha = t * 0.8;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 3 * t + 1;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, 6.283);
          ctx.stroke();
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  drawMinimap(ctx: CanvasRenderingContext2D, game: Game) {
    const small = this.w < 700;
    const mw = small ? 120 : 176;
    const mh = (mw * MAP_H) / MAP_W;
    const mx = 12;
    const my = 12;
    const sx = mw / WORLD_W;
    const sy = mh / WORLD_H;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.drawImage(this.miniCanvas, mx, my, mw, mh);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(mx + 0.5, my + 0.5, mw, mh);
    // view rect
    const vw = (this.w / game.cam.zoom) * sx;
    const vh = (this.h / game.cam.zoom) * sy;
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.strokeRect(mx + game.cam.x * sx - vw / 2, my + game.cam.y * sy - vh / 2, vw, vh);
    // uav sweep
    if (game.uavT > 0) {
      const a = (this.time * 2) % 6.283;
      ctx.strokeStyle = 'rgba(56,189,248,0.5)';
      ctx.beginPath();
      ctx.moveTo(mx + mw / 2, my + mh / 2);
      ctx.lineTo(mx + mw / 2 + Math.cos(a) * mw, my + mh / 2 + Math.sin(a) * mw);
      ctx.stroke();
    }
    for (const s of game.soldiers) {
      if (!s.alive) continue;
      const px = mx + s.x * sx;
      const py = my + s.y * sy;
      if (s.team === 1) {
        const firing = game.time - s.lastFireT < 1.2;
        if (!game.uavT && !firing) continue;
        ctx.fillStyle = '#ff4d4d';
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-3, -3, 6, 6);
        ctx.restore();
        continue;
      }
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(s.angle);
      ctx.fillStyle = s.isPlayer ? '#ffffff' : '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(5, 0);
      ctx.lineTo(-4, -3.5);
      ctx.lineTo(-4, 3.5);
      ctx.fill();
      ctx.restore();
    }
    for (const pk of game.pickups) {
      if (!pk.active) continue;
      ctx.fillStyle = pk.type === 'health' ? '#4ade80' : '#ffb72b';
      ctx.fillRect(mx + pk.x * sx - 1.5, my + pk.y * sy - 1.5, 3, 3);
    }
    ctx.restore();
  }
}
