import { useEffect, useRef } from 'react';
import type { InputState } from '../game/types';

interface Props {
  input: InputState;
  airstrikeReady: boolean;
  grenades: number;
}

const RADIUS = 52;

export function TouchControls({ input, airstrikeReady, grenades }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const lBase = useRef<HTMLDivElement>(null);
  const lKnob = useRef<HTMLDivElement>(null);
  const rBase = useRef<HTMLDivElement>(null);
  const rKnob = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current!;
    const sticks: Record<'l' | 'r', { id: number; ox: number; oy: number; t: number; moved: boolean } | null> = { l: null, r: null };

    const setVis = (side: 'l' | 'r', show: boolean, ox = 0, oy = 0, kx = 0, ky = 0) => {
      const base = side === 'l' ? lBase.current : rBase.current;
      const knob = side === 'l' ? lKnob.current : rKnob.current;
      if (!base || !knob) return;
      base.style.display = show ? 'block' : 'none';
      knob.style.display = show ? 'block' : 'none';
      if (show) {
        base.style.left = ox + 'px';
        base.style.top = oy + 'px';
        knob.style.left = kx + 'px';
        knob.style.top = ky + 'px';
      }
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      const target = e.target as HTMLElement;
      if (target.closest('[data-btn]')) return;
      const side: 'l' | 'r' = e.clientX < window.innerWidth / 2 ? 'l' : 'r';
      if (sticks[side]) return;
      sticks[side] = { id: e.pointerId, ox: e.clientX, oy: e.clientY, t: performance.now(), moved: false };
      root.setPointerCapture?.(e.pointerId);
      setVis(side, true, e.clientX, e.clientY, e.clientX, e.clientY);
      if (side === 'r') {
        input.aimActive = true;
      }
      e.preventDefault();
    };
    const onMove = (e: PointerEvent) => {
      for (const side of ['l', 'r'] as const) {
        const s = sticks[side];
        if (!s || s.id !== e.pointerId) continue;
        let dx = e.clientX - s.ox;
        let dy = e.clientY - s.oy;
        const d = Math.hypot(dx, dy);
        if (d > 8) s.moved = true;
        let nx = dx / RADIUS;
        let ny = dy / RADIUS;
        const m = Math.hypot(nx, ny);
        if (m > 1) {
          nx /= m;
          ny /= m;
          dx = nx * RADIUS;
          dy = ny * RADIUS;
        }
        if (side === 'l') {
          // small deadzone
          input.moveX = m < 0.12 ? 0 : nx;
          input.moveY = m < 0.12 ? 0 : ny;
        } else {
          if (m > 0.15) {
            input.aimX = nx;
            input.aimY = ny;
          }
          input.fire = m > 0.42;
        }
        setVis(side, true, s.ox, s.oy, s.ox + dx, s.oy + dy);
      }
    };
    const onUp = (e: PointerEvent) => {
      for (const side of ['l', 'r'] as const) {
        const s = sticks[side];
        if (!s || s.id !== e.pointerId) continue;
        if (side === 'l') {
          input.moveX = 0;
          input.moveY = 0;
        } else {
          input.fire = false;
          input.aimActive = false;
          // quick tap → single shot
          if (!s.moved && performance.now() - s.t < 220) {
            input.fire = true;
            setTimeout(() => (input.fire = false), 60);
          }
        }
        sticks[side] = null;
        setVis(side, false);
      }
    };
    root.addEventListener('pointerdown', onDown);
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerup', onUp);
    root.addEventListener('pointercancel', onUp);
    return () => {
      root.removeEventListener('pointerdown', onDown);
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerup', onUp);
      root.removeEventListener('pointercancel', onUp);
    };
  }, [input]);

  const press = (fn: () => void) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    fn();
  };

  return (
    <div ref={rootRef} className="absolute inset-0 z-10" style={{ touchAction: 'none' }}>
      <div ref={lBase} className="joystick-base" style={{ display: 'none' }} />
      <div ref={lKnob} className="joystick-knob" style={{ display: 'none' }} />
      <div ref={rBase} className="joystick-base" style={{ display: 'none', borderColor: 'rgba(255,183,43,0.5)' }} />
      <div ref={rKnob} className="joystick-knob" style={{ display: 'none' }} />

      {/* action buttons */}
      <div className="absolute right-3 bottom-3 flex flex-col items-end gap-2 pointer-events-none">
        <div className="flex gap-2">
          <button data-btn className="touch-btn" onPointerDown={press(() => (input.reload = true))}>
            <span className="text-lg leading-none">⟳</span>
            <span>RELOAD</span>
          </button>
          <button data-btn className="touch-btn" onPointerDown={press(() => (input.swap = true))}>
            <span className="text-lg leading-none">⇄</span>
            <span>SWAP</span>
          </button>
        </div>
        <div className="flex gap-2">
          <button
            data-btn
            className="touch-btn"
            style={{ opacity: airstrikeReady ? 1 : 0.35, borderColor: airstrikeReady ? '#ffb72b' : undefined }}
            onPointerDown={press(() => (input.killstreak = true))}
          >
            <span className="text-lg leading-none">✈</span>
            <span>STRIKE</span>
          </button>
          <button
            data-btn
            className="touch-btn"
            style={{ opacity: grenades > 0 ? 1 : 0.35, borderColor: grenades > 0 ? '#4ade80' : undefined }}
            onPointerDown={press(() => (input.grenade = true))}
          >
            <span className="text-lg leading-none">💣</span>
            <span>FRAG {grenades}</span>
          </button>
        </div>
      </div>
      <div className="absolute left-4 bottom-4 text-white/25 text-[10px] tracking-widest font-bold pointer-events-none">MOVE</div>
      <div className="absolute right-4 bottom-[140px] text-white/25 text-[10px] tracking-widest font-bold pointer-events-none">AIM · FIRE</div>
    </div>
  );
}
