import type {
  Soldier,
  Bullet,
  Grenade,
  Particle,
  FloatText,
  Pickup,
  Airstrike,
  Team,
  Vec,
  GameEvents,
  InputState,
  HudSnapshot,
  Difficulty,
  Loadout,
  WeaponId,
  ScoreRow,
  WeaponDef,
} from './types';
import { makeWeapon, WEAPONS, BOT_PRIMARIES } from './weapons';
import {
  parseMap,
  type MapData,
  resolveCircle,
  losClear,
  raycast,
  findPath,
  pathClear,
  solidAt,
  TILE,
  WORLD_W,
  WORLD_H,
} from './map';
import { audio } from './audio';

export interface Decal {
  type: 'hole' | 'blood' | 'scorch' | 'corpse' | 'casing';
  x: number;
  y: number;
  size: number;
  angle: number;
  team?: Team;
  skin?: number;
}

export interface GameSettings {
  loadout: Loadout;
  difficulty: Difficulty;
  playerName: string;
  touch: boolean;
}

const FRIEND_NAMES = ['Ghost', 'Soap', 'Price', 'Gaz', 'Roach', 'Nikolai'];
const ENEMY_NAMES = ['Makarov', 'Zakhaev', 'Viktor', 'Kamarov', 'Volk', 'Rook', 'Anatoly'];

const DIFF = {
  recruit: { skill: 0.3, react: 0.7, aimErr: 0.26, dmg: 0.65, friendSkill: 0.55 },
  regular: { skill: 0.55, react: 0.4, aimErr: 0.15, dmg: 0.9, friendSkill: 0.5 },
  veteran: { skill: 0.85, react: 0.2, aimErr: 0.075, dmg: 1.15, friendSkill: 0.45 },
};

const SCORE_LIMIT = 50;
const TIME_LIMIT = 300;
const TEAM_SIZE = 6;
const PLAYER_SPEED = 220;
const BOT_SPEED = 205;
const MAX_PARTICLES = 700;

const rnd = Math.random;
const rr = (a: number, b: number) => a + rnd() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function angleDiff(a: number, b: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
function lerpAngle(a: number, b: number, t: number) {
  return a + angleDiff(a, b) * t;
}

export class Game {
  map: MapData;
  soldiers: Soldier[] = [];
  bullets: Bullet[] = [];
  grenades: Grenade[] = [];
  particles: Particle[] = [];
  floats: FloatText[] = [];
  pickups: Pickup[] = [];
  airstrikes: Airstrike[] = [];
  decals: Decal[] = [];
  player: Soldier;
  teamScore: [number, number] = [0, 0];
  time = 0;
  timeLeft = TIME_LIMIT;
  state: 'playing' | 'paused' | 'over' = 'playing';
  shake = 0;
  shakeX = 0;
  shakeY = 0;
  cam = { x: 0, y: 0, zoom: 1 };
  view = { w: 1280, h: 720 };
  hudT = 0;
  events: GameEvents;
  settings: GameSettings;
  diff: (typeof DIFF)['regular'];
  nextId = 1;
  feedId = 1;
  // player feedback
  hitMarkerT = 0;
  hitMarkerKill = false;
  hurtT = 0;
  hurtAngle = 0;
  lastKillT = -10;
  multiKill = 0;
  bestStreak = 0;
  shotsFired = 0;
  shotsHit = 0;
  uavT = 0;
  airstrikeReady = false;
  killCam = { x: 0, y: 0 };
  fireHeld = false;
  aimWorld: Vec = { x: 0, y: 0 };
  mouseAngle = 0;
  flashLight = 0;
  slowMo = 1;
  ended = false;

  constructor(settings: GameSettings, events: GameEvents) {
    this.settings = settings;
    this.events = events;
    this.diff = DIFF[settings.difficulty];
    this.map = parseMap();
    for (const p of this.map.pickups) this.pickups.push({ ...p, active: true, respawnT: 0, bob: rnd() * 6 });

    // build teams
    const lo = settings.loadout;
    this.player = this.makeSoldier(settings.playerName || 'YOU', 0, true, lo.primary, lo.secondary, lo.grenades);
    this.soldiers.push(this.player);
    for (let i = 0; i < TEAM_SIZE - 1; i++) {
      const prim = BOT_PRIMARIES[(i * 3 + 1) % BOT_PRIMARIES.length];
      const s = this.makeSoldier(FRIEND_NAMES[i % FRIEND_NAMES.length], 0, false, prim, 'pistol', 1);
      s.ai.skill = this.diff.friendSkill + rr(-0.1, 0.15);
      this.soldiers.push(s);
    }
    for (let i = 0; i < TEAM_SIZE; i++) {
      const prim = BOT_PRIMARIES[(i * 5 + 2) % BOT_PRIMARIES.length];
      const s = this.makeSoldier(ENEMY_NAMES[i % ENEMY_NAMES.length], 1, false, prim, 'pistol', 1);
      s.ai.skill = clamp(this.diff.skill + rr(-0.12, 0.12), 0.1, 1);
      this.soldiers.push(s);
    }
    for (const s of this.soldiers) this.spawn(s, true);
    // give bots initial goals toward the center so action starts fast
    for (const s of this.soldiers) {
      if (s.isPlayer) continue;
      const hs = this.map.hotspots;
      s.ai.goal = hs[Math.floor(rnd() * hs.length)];
      s.ai.goalT = 14;
    }
    this.cam.x = this.player.x;
    this.cam.y = this.player.y;
    this.killCam.x = this.player.x;
    this.killCam.y = this.player.y;
    this.events.onAnnounce({ title: 'TEAM DEATHMATCH', sub: `FIRST TO ${SCORE_LIMIT} KILLS`, color: '#ffb72b' });
  }

  makeSoldier(name: string, team: Team, isPlayer: boolean, prim: WeaponId, sec: WeaponId, grenades: number): Soldier {
    return {
      id: this.nextId++,
      name,
      team,
      isPlayer,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      angle: team === 0 ? 0 : Math.PI,
      radius: 14,
      hp: 100,
      maxHp: 100,
      alive: true,
      respawnT: 0,
      weapons: [makeWeapon(prim), makeWeapon(sec)],
      cur: 0,
      fireCd: 0,
      reloading: false,
      reloadT: 0,
      lastDamageT: -10,
      walk: 0,
      moving: false,
      kick: 0,
      hitFlash: 0,
      kills: 0,
      deaths: 0,
      streak: 0,
      score: 0,
      grenades,
      grenadeCd: 0,
      skin: Math.floor(rnd() * 3),
      lastHitBy: -1,
      lastHitByWeapon: '',
      swapT: 0,
      lastFireT: -10,
      ai: {
        target: null,
        targetSeenT: 0,
        lastSeenPos: null,
        path: [],
        pathT: 0,
        goal: null,
        goalT: 0,
        strafeDir: 1,
        strafeT: 0,
        burstT: 0,
        restT: 0,
        reactT: 0,
        aimErr: 0,
        aimErrT: 0,
        stuckT: 0,
        lastPos: { x: 0, y: 0 },
        grenadeT: rr(3, 8),
        skill: 0.5,
      },
    };
  }

  // ---------- spawning ----------
  spawn(s: Soldier, initial = false) {
    const spawns = this.map.spawns[s.team];
    // choose spawn farthest from enemies (min-dist), with randomness
    let best = spawns[0];
    let bestScore = -Infinity;
    for (const sp of spawns) {
      let minD = Infinity;
      for (const e of this.soldiers) {
        if (e.team === s.team || !e.alive) continue;
        minD = Math.min(minD, Math.hypot(e.x - sp.x, e.y - sp.y));
      }
      const sc = (minD === Infinity ? 1000 : minD) + rnd() * 400;
      if (sc > bestScore) {
        bestScore = sc;
        best = sp;
      }
    }
    s.x = best.x + rr(-14, 14) + (s.team === 0 ? rr(0, 120) : rr(-120, 0));
    s.y = best.y + rr(-14, 14);
    resolveCircle(this.map, s, s.radius);
    s.vx = s.vy = 0;
    s.hp = s.maxHp;
    s.alive = true;
    s.reloading = false;
    s.fireCd = 0;
    s.swapT = 0;
    s.cur = 0;
    s.streak = 0;
    s.kick = 0;
    for (const w of s.weapons) {
      w.mag = w.def.mag;
      w.reserve = w.def.reserve;
    }
    s.grenades = s.isPlayer ? this.settings.loadout.grenades : 1;
    s.angle = s.team === 0 ? 0 : Math.PI;
    s.ai.target = null;
    s.ai.path = [];
    s.ai.goal = null;
    s.ai.lastSeenPos = null;
    s.ai.lastPos = { x: s.x, y: s.y };
    s.ai.stuckT = 0;
    if (!initial) {
      this.spawnRing(s.x, s.y, s.team === 0 ? '#38bdf8' : '#ff4d4d', 40);
      if (s.isPlayer) audio.respawn();
    }
  }

  // ---------- public control ----------
  resize(w: number, h: number) {
    this.view.w = w;
    this.view.h = h;
    this.cam.zoom = clamp(Math.max(w / 1300, h / 760), 0.72, 1.35);
  }

  togglePause() {
    if (this.state === 'over') return;
    this.state = this.state === 'paused' ? 'playing' : 'paused';
  }

  // ---------- main update ----------
  update(dt: number, input: InputState) {
    if (this.state !== 'playing') return;
    dt = Math.min(dt, 0.05);
    this.time += dt;
    this.timeLeft -= dt;

    // aim world position
    const p = this.player;
    if (input.touch) {
      if (input.aimActive) {
        this.mouseAngle = Math.atan2(input.aimY, input.aimX);
      } else if (input.moveX !== 0 || input.moveY !== 0) {
        this.mouseAngle = Math.atan2(input.moveY, input.moveX);
      }
      this.aimWorld.x = p.x + Math.cos(this.mouseAngle) * 300;
      this.aimWorld.y = p.y + Math.sin(this.mouseAngle) * 300;
    } else {
      this.aimWorld.x = this.cam.x + (input.mouseX - this.view.w / 2) / this.cam.zoom;
      this.aimWorld.y = this.cam.y + (input.mouseY - this.view.h / 2) / this.cam.zoom;
      this.mouseAngle = Math.atan2(this.aimWorld.y - p.y, this.aimWorld.x - p.x);
    }

    this.updatePlayer(dt, input);
    for (const s of this.soldiers) {
      if (!s.isPlayer && s.alive) this.updateBot(s, dt);
    }
    this.updateSoldiers(dt);
    this.updateBullets(dt);
    this.updateGrenades(dt);
    this.updateAirstrikes(dt);
    this.updateParticles(dt);
    this.updatePickups(dt);

    // respawns
    for (const s of this.soldiers) {
      if (!s.alive) {
        s.respawnT -= dt;
        if (s.respawnT <= 0) this.spawn(s);
      }
    }

    // timers
    this.shake = Math.max(0, this.shake - dt * 22 * (0.5 + this.shake * 0.15));
    const sh = this.shake * this.shake * 0.35;
    this.shakeX = rr(-sh, sh);
    this.shakeY = rr(-sh, sh);
    this.hitMarkerT = Math.max(0, this.hitMarkerT - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.uavT = Math.max(0, this.uavT - dt);
    this.flashLight = Math.max(0, this.flashLight - dt * 8);

    // camera
    let tx: number, ty: number;
    if (p.alive) {
      if (input.touch) {
        tx = p.x + Math.cos(this.mouseAngle) * 70 * (input.aimActive ? 1 : 0.3);
        ty = p.y + Math.sin(this.mouseAngle) * 70 * (input.aimActive ? 1 : 0.3);
      } else {
        tx = p.x + (this.aimWorld.x - p.x) * 0.28;
        ty = p.y + (this.aimWorld.y - p.y) * 0.28;
      }
      this.killCam.x = p.x;
      this.killCam.y = p.y;
    } else {
      tx = this.killCam.x;
      ty = this.killCam.y;
    }
    const k = 1 - Math.exp(-dt * 7);
    this.cam.x = lerp(this.cam.x, tx, k);
    this.cam.y = lerp(this.cam.y, ty, k);
    const hw = this.view.w / 2 / this.cam.zoom;
    const hh = this.view.h / 2 / this.cam.zoom;
    this.cam.x = clamp(this.cam.x, hw, WORLD_W - hw);
    this.cam.y = clamp(this.cam.y, hh, WORLD_H - hh);
    audio.setListener(p.x, p.y);

    // match end
    if (!this.ended && (this.timeLeft <= 0 || this.teamScore[0] >= SCORE_LIMIT || this.teamScore[1] >= SCORE_LIMIT)) {
      this.endMatch();
    }

    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.1;
      this.events.onHud(this.snapshot());
    }
  }

  endMatch() {
    this.ended = true;
    this.state = 'over';
    const won = this.teamScore[0] > this.teamScore[1];
    if (won) this.player.score += 500;
    audio.victory(won);
    this.events.onHud(this.snapshot());
    this.events.onGameOver({
      won,
      score: this.player.score,
      kills: this.player.kills,
      deaths: this.player.deaths,
      bestStreak: this.bestStreak,
      teamScore: [...this.teamScore],
      accuracy: this.shotsFired ? this.shotsHit / this.shotsFired : 0,
      loadout: this.settings.loadout.name,
      difficulty: this.settings.difficulty,
    });
  }

  snapshot(): HudSnapshot {
    const p = this.player;
    const w = p.weapons[p.cur];
    const rows: ScoreRow[] = this.soldiers
      .map((s) => ({ name: s.name, team: s.team, kills: s.kills, deaths: s.deaths, score: s.score, isPlayer: s.isPlayer }))
      .sort((a, b) => b.score - a.score);
    return {
      hp: Math.ceil(p.hp),
      maxHp: p.maxHp,
      mag: w.mag,
      reserve: w.reserve,
      weaponName: w.def.name,
      weaponId: w.def.id,
      secondaryName: p.weapons[1 - p.cur].def.short,
      reloading: p.reloading,
      reloadProgress: p.reloading ? 1 - p.reloadT / w.def.reload : 0,
      grenades: p.grenades,
      kills: p.kills,
      deaths: p.deaths,
      streak: p.streak,
      score: p.score,
      teamScore: [...this.teamScore],
      timeLeft: Math.max(0, this.timeLeft),
      alive: p.alive,
      respawnIn: p.alive ? 0 : Math.max(0, p.respawnT),
      uavT: this.uavT,
      airstrikeReady: this.airstrikeReady,
      scoreLimit: SCORE_LIMIT,
      lowHp: p.hp < 40,
      scoreboard: rows,
    };
  }

  // ---------- player ----------
  updatePlayer(dt: number, input: InputState) {
    const p = this.player;
    if (!p.alive) return;
    let mx = 0;
    let my = 0;
    if (input.touch) {
      mx = input.moveX;
      my = input.moveY;
    } else {
      const k = input.keys;
      if (k.has('KeyW') || k.has('ArrowUp')) my -= 1;
      if (k.has('KeyS') || k.has('ArrowDown')) my += 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    }
    const ml = Math.hypot(mx, my);
    if (ml > 1) {
      mx /= ml;
      my /= ml;
    }
    const w = p.weapons[p.cur];
    const spd = PLAYER_SPEED * w.def.moveMult * (p.reloading ? 0.85 : 1);
    const k = 1 - Math.exp(-dt * 16);
    p.vx = lerp(p.vx, mx * spd, k);
    p.vy = lerp(p.vy, my * spd, k);

    // aim (with touch aim assist)
    let aim = this.mouseAngle;
    if (input.touch) {
      let best: Soldier | null = null;
      let bestD = 0.22;
      for (const e of this.soldiers) {
        if (e.team === p.team || !e.alive) continue;
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d > w.def.range) continue;
        const a = Math.atan2(e.y - p.y, e.x - p.x);
        const ad = Math.abs(angleDiff(aim, a));
        if (ad < bestD && losClear(this.map, p.x, p.y, e.x, e.y)) {
          bestD = ad;
          best = e;
        }
      }
      if (best) aim = lerpAngle(aim, Math.atan2(best.y - p.y, best.x - p.x), 0.7);
    }
    p.angle = aim;

    // actions
    if (input.reload) {
      input.reload = false;
      this.startReload(p);
    }
    if (input.swap) {
      input.swap = false;
      this.swapWeapon(p);
    }
    if (input.grenade) {
      input.grenade = false;
      this.throwGrenade(p, this.aimWorld);
    }
    if (input.killstreak) {
      input.killstreak = false;
      this.callAirstrike(p);
    }
    const wantFire = input.touch ? input.fire || input.mouseDown : input.mouseDown || input.fire;
    if (wantFire) {
      if (w.def.auto || !this.fireHeld) this.fire(p, p.angle);
      this.fireHeld = true;
    } else {
      this.fireHeld = false;
    }
  }

  // ---------- bots ----------
  updateBot(s: Soldier, dt: number) {
    const ai = s.ai;
    const w = s.weapons[s.cur];
    const def = w.def;
    ai.reactT -= dt;
    ai.grenadeT -= dt;
    ai.pathT -= dt;
    ai.goalT -= dt;
    ai.strafeT -= dt;
    ai.aimErrT -= dt;

    // ---- perception ----
    const viewRange = 780;
    let best: Soldier | null = null;
    let bestD = Infinity;
    let curD = Infinity;
    let curVisible = false;
    if (ai.target && ai.target.alive) {
      curD = Math.hypot(ai.target.x - s.x, ai.target.y - s.y);
      curVisible = curD < viewRange * 1.15 && losClear(this.map, s.x, s.y, ai.target.x, ai.target.y);
    }
    for (const e of this.soldiers) {
      if (e.team === s.team || !e.alive) continue;
      const d = Math.hypot(e.x - s.x, e.y - s.y);
      if (d > viewRange || d >= bestD) continue;
      if (losClear(this.map, s.x, s.y, e.x, e.y)) {
        best = e;
        bestD = d;
      }
    }
    let target = curVisible ? ai.target : null;
    if (best && (!target || bestD < curD * 0.55)) target = best;
    if (target !== ai.target) {
      if (target) {
        ai.reactT = this.diff.react * (1.3 - ai.skill * 0.7) + rr(0, 0.25);
        ai.targetSeenT = 0;
      }
      ai.target = target;
    }
    if (target) {
      ai.targetSeenT += dt;
      ai.lastSeenPos = { x: target.x, y: target.y };
      ai.goalT = Math.min(ai.goalT, 3);
    }

    // ---- reload / swap decisions ----
    if (w.mag === 0) {
      if (w.reserve > 0) this.startReload(s);
      else if (s.weapons[1 - s.cur].mag > 0) this.swapWeapon(s);
    } else if (!target && !s.reloading && w.mag < def.mag * 0.4 && w.reserve > 0) {
      this.startReload(s);
    }
    if (s.cur === 1 && !target && s.weapons[0].mag > 0 && !s.reloading) this.swapWeapon(s);

    let moveX = 0;
    let moveY = 0;
    let usePath = false;
    let pathTarget: Vec | null = null;
    const speed = BOT_SPEED * def.moveMult * (0.92 + ai.skill * 0.12);

    if (target) {
      const dist = Math.hypot(target.x - s.x, target.y - s.y);
      // aiming with lead + error
      const lead = clamp(dist / def.speed, 0, 0.6) * (0.4 + ai.skill * 0.5);
      const px = target.x + target.vx * lead;
      const py = target.y + target.vy * lead;
      const trueAngle = Math.atan2(py - s.y, px - s.x);
      if (ai.aimErrT <= 0) {
        ai.aimErrT = rr(0.1, 0.22);
        const focus = clamp(ai.targetSeenT / 1.6, 0, 1);
        const tSpeed = Math.hypot(target.vx, target.vy) / 220;
        const err = this.diff.aimErr * (1.35 - ai.skill * 0.6) * (1 - focus * 0.55) * (1 + tSpeed * 0.7 + (dist / 900) * 0.5);
        ai.aimErr = rr(-err, err);
      }
      const desired = trueAngle + ai.aimErr;
      s.angle = lerpAngle(s.angle, desired, 1 - Math.exp(-dt * (7 + ai.skill * 9)));

      // shooting
      const aligned = Math.abs(angleDiff(s.angle, trueAngle)) < 0.22 + def.spread;
      if (ai.reactT <= 0 && aligned && dist < def.range * 0.95 && !s.reloading && s.swapT <= 0) {
        if (def.auto) {
          if (ai.burstT > 0) {
            ai.burstT -= dt;
            this.fire(s, s.angle);
          } else {
            ai.restT -= dt;
            if (ai.restT <= 0) {
              ai.burstT = rr(0.18, 0.55) * (0.6 + ai.skill * 0.7);
              ai.restT = rr(0.25, 0.7) * (1.3 - ai.skill);
            }
          }
        } else {
          ai.restT -= dt;
          if (ai.restT <= 0) {
            this.fire(s, s.angle);
            ai.restT = rr(0.1, 0.5) * (1.3 - ai.skill * 0.8);
          }
        }
      }

      // grenade
      if (ai.grenadeT <= 0 && s.grenades > 0 && dist > 220 && dist < 480 && rnd() < 0.5) {
        this.throwGrenade(s, { x: target.x, y: target.y });
        ai.grenadeT = rr(8, 16);
      } else if (ai.grenadeT <= 0) ai.grenadeT = rr(2, 5);

      // movement
      const lowHp = s.hp < 32 && ai.skill > 0.3;
      if (lowHp && dist < 420) {
        // retreat away from target
        const ax = s.x - target.x;
        const ay = s.y - target.y;
        const al = Math.hypot(ax, ay) || 1;
        if (!ai.goal || ai.goalT <= 0) {
          // pick a hotspot/spawn far from the target
          let bestP: Vec | null = null;
          let bestScore = -Infinity;
          for (const h of [...this.map.hotspots, ...this.map.spawns[s.team]]) {
            const sc = Math.hypot(h.x - target.x, h.y - target.y) - Math.hypot(h.x - s.x, h.y - s.y) * 0.6;
            if (sc > bestScore) {
              bestScore = sc;
              bestP = h;
            }
          }
          ai.goal = bestP;
          ai.goalT = 5;
          ai.pathT = 0;
        }
        usePath = true;
        pathTarget = ai.goal;
        if (!pathTarget) {
          moveX = ax / al;
          moveY = ay / al;
        }
      } else if (dist > def.optimal * 1.35) {
        usePath = true;
        pathTarget = { x: target.x, y: target.y };
        if (ai.pathT > 0.35) ai.pathT = Math.min(ai.pathT, 0.35);
      } else if (dist < def.optimal * 0.45 && def.id !== 'shotgun' && def.id !== 'smg') {
        const ax = s.x - target.x;
        const ay = s.y - target.y;
        const al = Math.hypot(ax, ay) || 1;
        moveX = ax / al;
        moveY = ay / al;
        // blend strafe
        moveX += (-ay / al) * ai.strafeDir * 0.6;
        moveY += (ax / al) * ai.strafeDir * 0.6;
      } else {
        // strafe perpendicular to target
        if (ai.strafeT <= 0) {
          ai.strafeDir = rnd() < 0.5 ? -1 : 1;
          ai.strafeT = rr(0.5, 1.4);
        }
        const dx = target.x - s.x;
        const dy = target.y - s.y;
        const dl = Math.hypot(dx, dy) || 1;
        moveX = (-dy / dl) * ai.strafeDir;
        moveY = (dx / dl) * ai.strafeDir;
        // slowly close in for shotguns/smgs
        if (def.id === 'shotgun' || def.id === 'smg') {
          moveX += (dx / dl) * 0.5;
          moveY += (dy / dl) * 0.5;
        }
        // wall check
        if (solidAt(this.map, s.x + moveX * 40, s.y + moveY * 40)) {
          ai.strafeDir *= -1;
          moveX = -moveX;
          moveY = -moveY;
          ai.strafeT = rr(0.6, 1.2);
        }
      }
    } else {
      // ---- no target: navigate ----
      if (ai.lastSeenPos) {
        const d = Math.hypot(ai.lastSeenPos.x - s.x, ai.lastSeenPos.y - s.y);
        if (d < 60 || ai.goalT <= -4) ai.lastSeenPos = null;
        else {
          ai.goal = ai.lastSeenPos;
        }
      }
      if (!ai.lastSeenPos) {
        const reached = ai.goal && Math.hypot(ai.goal.x - s.x, ai.goal.y - s.y) < 50;
        if (!ai.goal || reached || ai.goalT <= 0) {
          ai.goal = this.pickGoal(s);
          ai.goalT = rr(8, 14);
          ai.pathT = 0;
        }
      }
      usePath = true;
      pathTarget = ai.goal;
    }

    if (usePath && pathTarget) {
      if (ai.pathT <= 0 || ai.path.length === 0) {
        ai.path = findPath(this.map, s, pathTarget);
        ai.pathT = rr(0.6, 1.1);
        // shortcut: skip nodes while direct line is clear
        while (ai.path.length > 1 && pathClear(this.map, s.x, s.y, ai.path[1].x, ai.path[1].y, s.radius + 2)) ai.path.shift();
      }
      while (ai.path.length && Math.hypot(ai.path[0].x - s.x, ai.path[0].y - s.y) < 20) ai.path.shift();
      if (ai.path.length > 1 && pathClear(this.map, s.x, s.y, ai.path[1].x, ai.path[1].y, s.radius + 2)) ai.path.shift();
      const node = ai.path[0] ?? pathTarget;
      const dx = node.x - s.x;
      const dy = node.y - s.y;
      const dl = Math.hypot(dx, dy);
      if (dl > 4) {
        moveX = dx / dl;
        moveY = dy / dl;
      }
      if (!target) {
        // face movement direction, glance around
        const ma = Math.atan2(moveY, moveX);
        if (dl > 4) s.angle = lerpAngle(s.angle, ma, 1 - Math.exp(-dt * 6));
      }
    }

    // stuck detection
    ai.stuckT += dt;
    if (ai.stuckT > 1) {
      const moved = Math.hypot(s.x - ai.lastPos.x, s.y - ai.lastPos.y);
      if ((moveX !== 0 || moveY !== 0) && moved < 12) {
        ai.pathT = 0;
        ai.path = [];
        if (!target) {
          ai.goal = this.pickGoal(s);
          ai.goalT = rr(6, 10);
        }
        s.x += rr(-8, 8);
        s.y += rr(-8, 8);
      }
      ai.stuckT = 0;
      ai.lastPos = { x: s.x, y: s.y };
    }

    const ml = Math.hypot(moveX, moveY);
    if (ml > 1) {
      moveX /= ml;
      moveY /= ml;
    }
    const k = 1 - Math.exp(-dt * 12);
    s.vx = lerp(s.vx, moveX * speed, k);
    s.vy = lerp(s.vy, moveY * speed, k);
  }

  pickGoal(s: Soldier): Vec {
    // 45%: go where a teammate sees an enemy; else hotspot weighted toward enemy side
    const r = rnd();
    if (r < 0.45) {
      const seen = this.soldiers.filter((t) => t.team === s.team && t.alive && t.ai.target && t !== s);
      if (seen.length) {
        const t = seen[Math.floor(rnd() * seen.length)].ai.target!;
        return { x: t.x + rr(-100, 100), y: t.y + rr(-100, 100) };
      }
    }
    if (r < 0.6) {
      // hunt the nearest enemy's approximate location (radio intel)
      let bestE: Soldier | null = null;
      let bd = Infinity;
      for (const e of this.soldiers) {
        if (e.team === s.team || !e.alive) continue;
        const d = Math.hypot(e.x - s.x, e.y - s.y);
        if (d < bd) {
          bd = d;
          bestE = e;
        }
      }
      if (bestE) return { x: bestE.x + rr(-160, 160), y: bestE.y + rr(-160, 160) };
    }
    const hs = this.map.hotspots;
    return hs[Math.floor(rnd() * hs.length)];
  }

  // ---------- movement & physics ----------
  updateSoldiers(dt: number) {
    const alive = this.soldiers.filter((s) => s.alive);
    for (const s of alive) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      resolveCircle(this.map, s, s.radius);
      s.x = clamp(s.x, TILE + s.radius, WORLD_W - TILE - s.radius);
      s.y = clamp(s.y, TILE + s.radius, WORLD_H - TILE - s.radius);
      const sp = Math.hypot(s.vx, s.vy);
      s.moving = sp > 20;
      s.walk += sp * dt * 0.05;
      s.fireCd -= dt;
      s.swapT = Math.max(0, s.swapT - dt);
      s.kick = Math.max(0, s.kick - dt * 60);
      s.hitFlash = Math.max(0, s.hitFlash - dt * 6);
      s.grenadeCd = Math.max(0, s.grenadeCd - dt);
      if (s.reloading) {
        s.reloadT -= dt;
        if (s.reloadT <= 0) {
          s.reloading = false;
          const w = s.weapons[s.cur];
          const need = w.def.mag - w.mag;
          const take = Math.min(need, w.reserve);
          w.mag += take;
          w.reserve -= take;
        }
      }
      // health regen
      if (this.time - s.lastDamageT > 4.2 && s.hp < s.maxHp) {
        s.hp = Math.min(s.maxHp, s.hp + dt * 28);
      }
    }
    // separation
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i];
        const b = alive[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        const min = a.radius + b.radius;
        if (d2 < min * min && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const push = (min - d) / 2;
          const nx = dx / d;
          const ny = dy / d;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
        }
      }
    }
  }

  // ---------- weapons ----------
  fire(s: Soldier, angle: number) {
    if (s.fireCd > 0 || s.reloading || s.swapT > 0) return;
    const w = s.weapons[s.cur];
    const def = w.def;
    if (w.mag <= 0) {
      if (s.isPlayer) {
        audio.empty();
        s.fireCd = 0.25;
        if (w.reserve > 0) this.startReload(s);
        else if (s.weapons[1 - s.cur].mag > 0) this.swapWeapon(s);
      }
      return;
    }
    w.mag--;
    s.fireCd = def.rof;
    s.kick = def.kick;
    s.lastFireT = this.time;
    const tipX = s.x + Math.cos(angle) * (def.length + 6);
    const tipY = s.y + Math.sin(angle) * (def.length + 6);
    const moveSpread = Math.hypot(s.vx, s.vy) > 40 ? def.spread * 0.6 : 0;
    for (let i = 0; i < def.pellets; i++) {
      const a = angle + rr(-1, 1) * (def.spread + moveSpread);
      const sp = def.speed * rr(0.94, 1.06);
      this.bullets.push({
        x: tipX,
        y: tipY,
        px: tipX,
        py: tipY,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        dmg: def.damage * (s.isPlayer ? 1 : this.diff.dmg),
        team: s.team,
        owner: s,
        life: def.range / sp,
        color: def.tracer,
        len: def.id === 'sniper' ? 90 : def.id === 'shotgun' ? 22 : 40,
        weapon: def.id,
      });
    }
    if (s.isPlayer) {
      this.shotsFired += def.pellets;
      this.addShake(def.recoil * 0.55);
    }
    // muzzle flash
    this.particles.push({
      x: tipX,
      y: tipY,
      vx: 0,
      vy: 0,
      life: 0.05,
      maxLife: 0.05,
      size: def.id === 'shotgun' || def.id === 'sniper' ? 30 : 20,
      color: '#fff3c4',
      type: 'flash',
      rot: angle,
      vr: 0,
      grav: 0,
      drag: 0,
    });
    // smoke puff
    if (rnd() < 0.5)
      this.addParticle(tipX, tipY, Math.cos(angle) * 60 + rr(-20, 20), Math.sin(angle) * 60 + rr(-20, 20), rr(0.3, 0.6), rr(4, 8), 'rgba(200,200,200,0.35)', 'smoke');
    // shell casing
    const sx = s.x + Math.cos(angle) * 8;
    const sy = s.y + Math.sin(angle) * 8;
    const perp = angle + Math.PI / 2;
    this.addParticle(sx, sy, Math.cos(perp) * rr(80, 140) + s.vx * 0.3, Math.sin(perp) * rr(80, 140) + s.vy * 0.3, rr(0.5, 0.8), def.id === 'shotgun' ? 5 : 3, def.id === 'shotgun' ? '#d9534f' : '#e8c36a', 'shell');
    if (s.isPlayer) this.flashLight = 1;
    audio.shot(def.sound, s.isPlayer ? undefined : s.x, s.isPlayer ? undefined : s.y);
  }

  startReload(s: Soldier) {
    const w = s.weapons[s.cur];
    if (s.reloading || w.mag >= w.def.mag || w.reserve <= 0) return;
    s.reloading = true;
    s.reloadT = w.def.reload;
    audio.reload(s.isPlayer ? undefined : s.x, s.isPlayer ? undefined : s.y);
  }

  swapWeapon(s: Soldier) {
    if (s.swapT > 0) return;
    s.cur = 1 - s.cur;
    s.reloading = false;
    s.swapT = 0.35;
    if (s.isPlayer) audio.swap();
  }

  throwGrenade(s: Soldier, target: Vec) {
    if (s.grenades <= 0 || s.grenadeCd > 0 || !s.alive) return;
    s.grenades--;
    s.grenadeCd = 0.8;
    const dx = target.x - s.x;
    const dy = target.y - s.y;
    const d = Math.hypot(dx, dy) || 1;
    const spd = clamp(d * 1.25, 180, 560);
    const a = Math.atan2(dy, dx) + (s.isPlayer ? 0 : rr(-0.12, 0.12));
    this.grenades.push({
      x: s.x + Math.cos(a) * 20,
      y: s.y + Math.sin(a) * 20,
      vx: Math.cos(a) * spd,
      vy: Math.sin(a) * spd,
      z: 20,
      vz: 220,
      fuse: 2.1,
      owner: s,
      team: s.team,
      rot: 0,
    });
    if (s.isPlayer) audio.pinPull();
  }

  callAirstrike(s: Soldier) {
    if (!this.airstrikeReady) return;
    this.airstrikeReady = false;
    const a = rr(0, Math.PI * 2);
    this.airstrikes.push({ x: this.aimWorld.x, y: this.aimWorld.y, angle: a, t: 0, bombsDropped: 0, owner: s });
    this.events.onAnnounce({ title: 'AIRSTRIKE INBOUND', sub: 'DANGER CLOSE', color: '#ff4d4d' });
    audio.jetFlyby();
  }

  // ---------- bullets ----------
  updateBullets(dt: number) {
    const bl = this.bullets;
    for (let i = bl.length - 1; i >= 0; i--) {
      const b = bl[i];
      b.px = b.x;
      b.py = b.y;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      let dead = b.life <= 0;
      // wall hit
      const hit = raycast(this.map, b.px, b.py, b.x, b.y);
      let hitT = 1;
      if (hit) {
        const segLen = Math.hypot(b.x - b.px, b.y - b.py) || 1;
        hitT = Math.hypot(hit.x - b.px, hit.y - b.py) / segLen;
      }
      // soldier hits
      let victim: Soldier | null = null;
      let vt = hitT;
      for (const s of this.soldiers) {
        if (!s.alive || s.team === b.team) continue;
        const t = segCircle(b.px, b.py, b.x, b.y, s.x, s.y, s.radius + 2);
        if (t !== null && t < vt) {
          vt = t;
          victim = s;
        }
      }
      if (victim) {
        const hx = b.px + (b.x - b.px) * vt;
        const hy = b.py + (b.y - b.py) * vt;
        this.damage(victim, b.dmg, b.owner, b.weapon, Math.atan2(b.vy, b.vx), hx, hy);
        dead = true;
      } else if (hit) {
        this.wallImpact(hit.x, hit.y, Math.atan2(b.vy, b.vx), b.color);
        dead = true;
      }
      if (dead) {
        bl[i] = bl[bl.length - 1];
        bl.pop();
      }
    }
  }

  wallImpact(x: number, y: number, angle: number, color: string) {
    const back = angle + Math.PI;
    for (let i = 0; i < 4; i++) {
      const a = back + rr(-0.9, 0.9);
      const sp = rr(120, 320);
      this.addParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rr(0.15, 0.35), rr(1.5, 2.5), i === 0 ? '#ffffff' : color, 'spark', 0, 0.9);
    }
    this.addParticle(x, y, Math.cos(back) * 30, Math.sin(back) * 30, rr(0.4, 0.8), rr(5, 9), 'rgba(180,180,180,0.4)', 'smoke');
    this.decals.push({ type: 'hole', x: x + Math.cos(back) * 2, y: y + Math.sin(back) * 2, size: rr(2.5, 4), angle: 0 });
    if (rnd() < 0.35) audio.impactWall(x, y);
  }

  damage(v: Soldier, amount: number, by: Soldier, weapon: string, angle: number, hx: number, hy: number) {
    if (!v.alive) return;
    v.hp -= amount;
    v.lastDamageT = this.time;
    v.hitFlash = 1;
    v.lastHitBy = by.id;
    v.lastHitByWeapon = weapon;
    // blood
    const n = amount > 60 ? 12 : 6;
    for (let i = 0; i < n; i++) {
      const a = angle + rr(-0.7, 0.7);
      const sp = rr(60, 260);
      this.addParticle(hx, hy, Math.cos(a) * sp, Math.sin(a) * sp, rr(0.2, 0.5), rr(2, 4), rnd() < 0.5 ? '#b3111e' : '#8a0c16', 'blood', 0, 0.85);
    }
    if (rnd() < 0.6) this.decals.push({ type: 'blood', x: hx + Math.cos(angle) * rr(10, 30), y: hy + Math.sin(angle) * rr(10, 30), size: rr(5, 11), angle: rr(0, 6.28) });
    // knockback
    v.vx += Math.cos(angle) * 40;
    v.vy += Math.sin(angle) * 40;
    if (by.isPlayer) {
      this.shotsHit++;
      this.hitMarkerT = 0.18;
      this.hitMarkerKill = false;
      this.floats.push({ x: v.x + rr(-8, 8), y: v.y - 22, vy: -50, life: 0.7, text: `${Math.round(amount)}`, color: '#ffe082', size: 15 });
      audio.hit();
    }
    if (v.isPlayer) {
      this.hurtT = 0.6;
      this.hurtAngle = Math.atan2(by.y - v.y, by.x - v.x);
      this.addShake(amount > 50 ? 6 : 3.2);
      audio.hurt();
    } else {
      audio.impactFlesh(hx, hy);
    }
    if (v.hp <= 0) this.kill(v, by, weapon);
  }

  kill(v: Soldier, by: Soldier, weapon: string) {
    v.alive = false;
    v.hp = 0;
    v.deaths++;
    v.respawnT = v.isPlayer ? 3.2 : rr(4.5, 7.5);
    v.streak = 0;
    v.ai.target = null;
    // corpse + blood pool
    this.decals.push({ type: 'corpse', x: v.x, y: v.y, size: v.radius, angle: v.angle + rr(-0.5, 0.5), team: v.team, skin: v.skin });
    for (let i = 0; i < 14; i++) {
      const a = rr(0, 6.28);
      const sp = rr(40, 220);
      this.addParticle(v.x, v.y, Math.cos(a) * sp, Math.sin(a) * sp, rr(0.3, 0.7), rr(2, 5), '#a10f1b', 'blood', 0, 0.85);
    }
    audio.death(v.x, v.y);

    const self = by === v || by.team === v.team;
    if (!self) {
      by.kills++;
      by.streak++;
      this.teamScore[by.team]++;
      let pts = 100;
      const bonuses: string[] = [];
      if (weapon === 'grenade') {
        pts += 25;
        bonuses.push('FRAG');
      }
      if (weapon === 'airstrike') {
        pts += 50;
        bonuses.push('AIRSTRIKE');
      }
      const d = Math.hypot(by.x - v.x, by.y - v.y);
      if (d > 720 && weapon !== 'grenade' && weapon !== 'airstrike') {
        pts += 25;
        bonuses.push('LONGSHOT');
      }
      if (v.lastHitBy !== by.id && weapon !== 'airstrike') {
        /* assist logic omitted */
      }
      if (by.isPlayer) {
        if (this.player.lastHitBy === v.id && this.player.deaths > 0 && v.kills > 0) {
          // revenge if this enemy killed us last
        }
        this.onPlayerKill(v, pts, bonuses, weapon);
      } else {
        by.score += pts;
      }
    } else {
      v.score = Math.max(0, v.score - 50);
    }
    this.events.onKillFeed({
      id: this.feedId++,
      killer: by.name,
      killerTeam: by.team,
      victim: v.name,
      victimTeam: v.team,
      weapon: self ? 'suicide' : weapon,
      time: this.time,
    });
    if (v.isPlayer) {
      this.addShake(7);
      this.multiKill = 0;
      this.events.onAnnounce({ title: 'KILLED BY ' + by.name.toUpperCase(), sub: WEAPONS[weapon as WeaponId]?.name ?? weapon.toUpperCase(), color: '#ff4d4d' });
    }
  }

  onPlayerKill(v: Soldier, pts: number, bonuses: string[], weapon: string) {
    const p = this.player;
    this.hitMarkerT = 0.3;
    this.hitMarkerKill = true;
    audio.killConfirm();
    // multi-kill
    if (this.time - this.lastKillT < 3.5) this.multiKill++;
    else this.multiKill = 1;
    this.lastKillT = this.time;
    const mk = ['', '', 'DOUBLE KILL', 'TRIPLE KILL', 'MULTI KILL', 'MEGA KILL', 'ULTRA KILL'];
    if (this.multiKill >= 2) {
      const bonus = 50 * (this.multiKill - 1);
      pts += bonus;
      this.events.onAnnounce({ title: mk[Math.min(this.multiKill, mk.length - 1)], sub: `+${bonus}`, color: '#ffb72b' });
      this.addShake(2.5);
    }
    // revenge
    if (p.lastHitBy === v.id && p.deaths > 0 && weapon !== 'airstrike') {
      // only counts if that enemy was our last killer (approximate)
      bonuses.push('PAYBACK');
      pts += 25;
    }
    p.score += pts;
    this.bestStreak = Math.max(this.bestStreak, p.streak);
    this.floats.push({ x: v.x, y: v.y - 40, vy: -40, life: 1.1, text: `+${pts}`, color: '#ffb72b', size: 20 });
    if (bonuses.length) this.floats.push({ x: v.x, y: v.y - 62, vy: -30, life: 1.1, text: bonuses.join(' • '), color: '#fff', size: 12 });
    // killstreaks
    if (p.streak === 3) {
      this.uavT = 25;
      this.events.onAnnounce({ title: 'UAV ONLINE', sub: 'ENEMY POSITIONS REVEALED', color: '#38bdf8' });
      audio.streak();
    } else if (p.streak === 5) {
      this.airstrikeReady = true;
      this.events.onAnnounce({ title: 'AIRSTRIKE READY', sub: this.settings.touch ? 'TAP ✈ TO CALL IN' : 'PRESS F TO CALL IN', color: '#ffb72b' });
      audio.streak();
    } else if (p.streak === 7) {
      p.score += 200;
      this.events.onAnnounce({ title: 'UNSTOPPABLE', sub: '7 KILL STREAK  +200', color: '#ff4d4d' });
      audio.streak();
    } else if (p.streak === 10) {
      p.score += 500;
      this.airstrikeReady = true;
      this.uavT = 40;
      this.events.onAnnounce({ title: 'GODLIKE', sub: '10 KILL STREAK  +500  AIRSTRIKE READY', color: '#ff4d4d' });
      audio.streak();
    } else if (p.streak > 10 && p.streak % 5 === 0) {
      this.airstrikeReady = true;
      this.events.onAnnounce({ title: `${p.streak} KILL STREAK`, sub: 'AIRSTRIKE READY', color: '#ffb72b' });
      audio.streak();
    }
  }

  // ---------- grenades / explosions ----------
  updateGrenades(dt: number) {
    const gl = this.grenades;
    for (let i = gl.length - 1; i >= 0; i--) {
      const g = gl[i];
      g.fuse -= dt;
      const nx = g.x + g.vx * dt;
      const ny = g.y + g.vy * dt;
      if (solidAt(this.map, nx, g.y)) {
        g.vx *= -0.45;
        audio.grenadeBounce(g.x, g.y);
      } else g.x = nx;
      if (solidAt(this.map, g.x, ny)) {
        g.vy *= -0.45;
        audio.grenadeBounce(g.x, g.y);
      } else g.y = ny;
      g.vz -= 900 * dt;
      g.z += g.vz * dt;
      if (g.z < 0) {
        g.z = 0;
        if (Math.abs(g.vz) > 60) audio.grenadeBounce(g.x, g.y);
        g.vz *= -0.4;
        g.vx *= 0.7;
        g.vy *= 0.7;
      }
      const drag = g.z <= 0.5 ? 0.88 : 0.995;
      g.vx *= Math.pow(drag, dt * 60);
      g.vy *= Math.pow(drag, dt * 60);
      g.rot += (Math.abs(g.vx) + Math.abs(g.vy)) * dt * 0.05;
      if (g.fuse <= 0) {
        this.explode(g.x, g.y, 140, 125, g.owner, 'grenade');
        gl[i] = gl[gl.length - 1];
        gl.pop();
      }
    }
  }

  explode(x: number, y: number, radius: number, dmg: number, owner: Soldier, weapon: string) {
    // damage
    for (const s of this.soldiers) {
      if (!s.alive) continue;
      const d = Math.hypot(s.x - x, s.y - y);
      if (d > radius + s.radius) continue;
      if (!losClear(this.map, x, y, s.x, s.y) && d > 30) continue;
      if (s.team === owner.team && !s.isPlayer && s !== owner) continue; // no friendly fire on bots
      if (s.team === owner.team && s.isPlayer && owner !== s) continue;
      const f = clamp(1 - d / (radius + s.radius), 0, 1);
      const amount = Math.max(12, dmg * Math.pow(f, 0.8)) * (s === owner ? 0.5 : 1);
      this.damage(s, amount, owner, weapon, Math.atan2(s.y - y, s.x - x), s.x, s.y);
    }
    // visuals
    const pd = Math.hypot(this.player.x - x, this.player.y - y);
    this.addShake(clamp(14 - pd / 60, 2, 14));
    this.particles.push({ x, y, vx: 0, vy: 0, life: 0.09, maxLife: 0.09, size: radius * 0.9, color: '#fff7d6', type: 'flash', rot: 0, vr: 0, grav: 0, drag: 0 });
    this.particles.push({ x, y, vx: 0, vy: 0, life: 0.45, maxLife: 0.45, size: radius, color: '#ffb72b', type: 'ring', rot: 0, vr: 0, grav: 0, drag: 0 });
    for (let i = 0; i < 26; i++) {
      const a = rr(0, 6.28);
      const sp = rr(40, 260);
      this.addParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rr(0.25, 0.6), rr(8, 18), rnd() < 0.5 ? '#ff9a2b' : '#ffd36b', 'fire', 0, 0.9);
    }
    for (let i = 0; i < 22; i++) {
      const a = rr(0, 6.28);
      const sp = rr(20, 120);
      this.addParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rr(0.8, 1.8), rr(12, 26), `rgba(60,55,50,${rr(0.35, 0.6)})`, 'smoke', 0, 0.96);
    }
    for (let i = 0; i < 18; i++) {
      const a = rr(0, 6.28);
      const sp = rr(150, 480);
      this.addParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rr(0.3, 0.8), rr(2, 4), rnd() < 0.5 ? '#3a3a3a' : '#ffcc66', rnd() < 0.5 ? 'debris' : 'spark', 0, 0.92);
    }
    this.decals.push({ type: 'scorch', x, y, size: radius * 0.55, angle: rr(0, 6.28) });
    this.flashLight = 1;
    audio.explosion(x, y);
  }

  updateAirstrikes(dt: number) {
    const al = this.airstrikes;
    for (let i = al.length - 1; i >= 0; i--) {
      const a = al[i];
      const prev = a.t;
      a.t += dt;
      if (prev < 1.4 && a.t >= 1.4) audio.bombWhistle();
      const startT = 2.2;
      const total = 7;
      while (a.bombsDropped < total && a.t >= startT + a.bombsDropped * 0.13) {
        const k = a.bombsDropped - (total - 1) / 2;
        const bx = a.x + Math.cos(a.angle) * k * 95 + rr(-15, 15);
        const by = a.y + Math.sin(a.angle) * k * 95 + rr(-15, 15);
        this.explode(bx, by, 175, 220, a.owner, 'airstrike');
        a.bombsDropped++;
      }
      if (a.bombsDropped >= total) {
        al[i] = al[al.length - 1];
        al.pop();
      }
    }
  }

  // ---------- particles ----------
  addParticle(x: number, y: number, vx: number, vy: number, life: number, size: number, color: string, type: Particle['type'], grav = 0, drag = 0.98) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push({ x, y, vx, vy, life, maxLife: life, size, color, type, rot: rr(0, 6.28), vr: rr(-8, 8), grav, drag });
  }

  spawnRing(x: number, y: number, color: string, size: number) {
    this.particles.push({ x, y, vx: 0, vy: 0, life: 0.6, maxLife: 0.6, size, color, type: 'ring', rot: 0, vr: 0, grav: 0, drag: 0 });
  }

  updateParticles(dt: number) {
    const pl = this.particles;
    for (let i = pl.length - 1; i >= 0; i--) {
      const p = pl[i];
      p.life -= dt;
      if (p.life <= 0) {
        if (p.type === 'shell') this.decals.push({ type: 'casing', x: p.x, y: p.y, size: p.size, angle: p.rot });
        pl[i] = pl[pl.length - 1];
        pl.pop();
        continue;
      }
      if (p.type === 'flash' || p.type === 'ring') continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const dr = Math.pow(p.drag, dt * 60);
      p.vx *= dr;
      p.vy *= dr;
      p.rot += p.vr * dt;
      if (p.type === 'smoke' || p.type === 'fire') p.size += dt * (p.type === 'smoke' ? 14 : -6);
      if ((p.type === 'shell' || p.type === 'debris') && solidAt(this.map, p.x, p.y)) {
        p.vx *= -0.5;
        p.vy *= -0.5;
        p.x += p.vx * dt * 2;
        p.y += p.vy * dt * 2;
      }
    }
    const fl = this.floats;
    for (let i = fl.length - 1; i >= 0; i--) {
      const f = fl[i];
      f.life -= dt;
      f.y += f.vy * dt;
      f.vy *= 0.95;
      if (f.life <= 0) {
        fl[i] = fl[fl.length - 1];
        fl.pop();
      }
    }
  }

  updatePickups(dt: number) {
    for (const pk of this.pickups) {
      pk.bob += dt * 3;
      if (!pk.active) {
        pk.respawnT -= dt;
        if (pk.respawnT <= 0) {
          pk.active = true;
          this.spawnRing(pk.x, pk.y, '#ffffff', 24);
        }
        continue;
      }
      for (const s of this.soldiers) {
        if (!s.alive) continue;
        if (Math.hypot(s.x - pk.x, s.y - pk.y) > s.radius + 14) continue;
        if (pk.type === 'health') {
          if (s.hp >= s.maxHp) continue;
          s.hp = Math.min(s.maxHp, s.hp + 60);
          if (s.isPlayer) this.floats.push({ x: s.x, y: s.y - 30, vy: -40, life: 0.9, text: '+60 HP', color: '#4ade80', size: 16 });
        } else {
          let any = false;
          for (const w of s.weapons) {
            if (w.reserve < w.def.reserve) {
              any = true;
              w.reserve = w.def.reserve;
            }
          }
          if (s.grenades < 3) {
            any = true;
            s.grenades++;
          }
          if (!any) continue;
          if (s.isPlayer) this.floats.push({ x: s.x, y: s.y - 30, vy: -40, life: 0.9, text: 'AMMO + FRAG', color: '#ffb72b', size: 16 });
        }
        pk.active = false;
        pk.respawnT = 25;
        if (s.isPlayer) {
          audio.pickup(pk.type);
          this.spawnRing(pk.x, pk.y, pk.type === 'health' ? '#4ade80' : '#ffb72b', 30);
        }
        break;
      }
    }
  }

  addShake(v: number) {
    this.shake = Math.min(16, Math.max(this.shake, v));
  }
}

/** segment (ax,ay)-(bx,by) vs circle; returns t in [0,1] of first hit or null */
function segCircle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, r: number): number | null {
  const dx = bx - ax;
  const dy = by - ay;
  const fx = ax - cx;
  const fy = ay - cy;
  const a = dx * dx + dy * dy;
  if (a < 1e-6) return fx * fx + fy * fy <= r * r ? 0 : null;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  let disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  disc = Math.sqrt(disc);
  const t1 = (-b - disc) / (2 * a);
  const t2 = (-b + disc) / (2 * a);
  if (t1 >= 0 && t1 <= 1) return t1;
  if (t2 >= 0 && t2 <= 1) return 0; // started inside
  return null;
}

export { WEAPONS as WEAPON_DEFS };
export type { WeaponDef };
