import type { HighScore, MatchResult } from './types';

const KEY = 'cos_highscores_v1';
const NAME_KEY = 'cos_player_name';
const PREF_KEY = 'cos_prefs';

export function loadHighScores(): HighScore[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as HighScore[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveHighScore(name: string, r: MatchResult): { list: HighScore[]; rank: number } {
  const list = loadHighScores();
  const entry: HighScore = {
    name: name || 'SOLDIER',
    score: r.score,
    kills: r.kills,
    deaths: r.deaths,
    won: r.won,
    loadout: r.loadout,
    difficulty: r.difficulty,
    date: Date.now(),
  };
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  const top = list.slice(0, 10);
  const rank = top.findIndex((e) => e === entry);
  try {
    localStorage.setItem(KEY, JSON.stringify(top));
  } catch {
    /* ignore */
  }
  return { list: top, rank };
}

export function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) || '';
  } catch {
    return '';
  }
}

export function saveName(n: string) {
  try {
    localStorage.setItem(NAME_KEY, n);
  } catch {
    /* ignore */
  }
}

export interface Prefs {
  loadout: string;
  difficulty: string;
}

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (raw) return JSON.parse(raw) as Prefs;
  } catch {
    /* ignore */
  }
  return { loadout: 'assault', difficulty: 'regular' };
}

export function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}
