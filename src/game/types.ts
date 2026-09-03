export type Team = 0 | 1;

export interface Vec {
  x: number;
  y: number;
}

export type WeaponId = 'ar' | 'smg' | 'shotgun' | 'sniper' | 'lmg' | 'pistol';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  short: string;
  damage: number;
  rof: number; // seconds between shots
  spread: number; // radians
  speed: number; // px/s
  mag: number;
  reserve: number;
  reload: number; // seconds
  pellets: number;
  range: number; // px
  auto: boolean;
  recoil: number; // shake amount
  kick: number; // muzzle kick animation
  moveMult: number;
  tracer: string;
  length: number; // gun length for drawing
  width: number;
  sound: 'pistol' | 'ar' | 'smg' | 'shotgun' | 'sniper' | 'lmg';
  optimal: number; // preferred bot engagement distance
}

export interface WeaponState {
  def: WeaponDef;
  mag: number;
  reserve: number;
}

export interface AIState {
  target: Soldier | null;
  targetSeenT: number; // how long target has been continuously tracked
  lastSeenPos: Vec | null;
  path: Vec[];
  pathT: number;
  goal: Vec | null;
  goalT: number;
  strafeDir: number;
  strafeT: number;
  burstT: number;
  restT: number;
  reactT: number;
  aimErr: number;
  aimErrT: number;
  stuckT: number;
  lastPos: Vec;
  grenadeT: number;
  skill: number; // 0..1
}

export interface Soldier {
  id: number;
  name: string;
  team: Team;
  isPlayer: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  radius: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  respawnT: number;
  weapons: WeaponState[];
  cur: number;
  fireCd: number;
  reloading: boolean;
  reloadT: number;
  lastDamageT: number;
  walk: number;
  moving: boolean;
  kick: number;
  hitFlash: number;
  kills: number;
  deaths: number;
  streak: number;
  score: number;
  grenades: number;
  grenadeCd: number;
  ai: AIState;
  skin: number;
  lastHitBy: number;
  lastHitByWeapon: string;
  swapT: number;
  lastFireT: number;
}

export interface Bullet {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  dmg: number;
  team: Team;
  owner: Soldier;
  life: number;
  color: string;
  len: number;
  weapon: string;
}

export interface Grenade {
  x: number;
  y: number;
  vx: number;
  vy: number;
  z: number;
  vz: number;
  fuse: number;
  owner: Soldier;
  team: Team;
  rot: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  type: 'spark' | 'smoke' | 'blood' | 'shell' | 'fire' | 'flash' | 'debris' | 'ring';
  rot: number;
  vr: number;
  grav: number;
  drag: number;
}

export interface FloatText {
  x: number;
  y: number;
  vy: number;
  life: number;
  text: string;
  color: string;
  size: number;
}

export interface Pickup {
  x: number;
  y: number;
  type: 'health' | 'ammo';
  active: boolean;
  respawnT: number;
  bob: number;
}

export interface Airstrike {
  x: number;
  y: number;
  angle: number;
  t: number;
  bombsDropped: number;
  owner: Soldier;
}

export interface KillFeedItem {
  id: number;
  killer: string;
  killerTeam: Team;
  victim: string;
  victimTeam: Team;
  weapon: string;
  time: number;
}

export interface HudSnapshot {
  hp: number;
  maxHp: number;
  mag: number;
  reserve: number;
  weaponName: string;
  weaponId: WeaponId;
  secondaryName: string;
  reloading: boolean;
  reloadProgress: number;
  grenades: number;
  kills: number;
  deaths: number;
  streak: number;
  score: number;
  teamScore: [number, number];
  timeLeft: number;
  alive: boolean;
  respawnIn: number;
  uavT: number;
  airstrikeReady: boolean;
  scoreLimit: number;
  lowHp: boolean;
  scoreboard: ScoreRow[];
}

export interface ScoreRow {
  name: string;
  team: Team;
  kills: number;
  deaths: number;
  score: number;
  isPlayer: boolean;
}

export interface Announcement {
  id: number;
  title: string;
  sub?: string;
  color: string;
}

export type Difficulty = 'recruit' | 'regular' | 'veteran';

export interface Loadout {
  id: string;
  name: string;
  desc: string;
  primary: WeaponId;
  secondary: WeaponId;
  grenades: number;
  icon: string;
}

export interface MatchResult {
  won: boolean;
  score: number;
  kills: number;
  deaths: number;
  bestStreak: number;
  teamScore: [number, number];
  accuracy: number;
  loadout: string;
  difficulty: Difficulty;
}

export interface HighScore {
  name: string;
  score: number;
  kills: number;
  deaths: number;
  won: boolean;
  loadout: string;
  difficulty: Difficulty;
  date: number;
}

export interface GameEvents {
  onKillFeed: (item: KillFeedItem) => void;
  onAnnounce: (a: Omit<Announcement, 'id'>) => void;
  onHud: (h: HudSnapshot) => void;
  onGameOver: (r: MatchResult) => void;
  onHitMarker: (kill: boolean) => void;
}

export interface InputState {
  keys: Set<string>;
  mouseX: number;
  mouseY: number;
  mouseDown: boolean;
  // touch
  touch: boolean;
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
  aimActive: boolean;
  fire: boolean;
  reload: boolean;
  swap: boolean;
  grenade: boolean;
  killstreak: boolean;
  pause: boolean;
}
