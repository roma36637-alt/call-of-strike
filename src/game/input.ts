import type { InputState } from './types';

export function createInput(touch: boolean): InputState {
  return {
    keys: new Set(),
    mouseX: 0,
    mouseY: 0,
    mouseDown: false,
    touch,
    moveX: 0,
    moveY: 0,
    aimX: 0,
    aimY: 0,
    aimActive: false,
    fire: false,
    reload: false,
    swap: false,
    grenade: false,
    killstreak: false,
    pause: false,
  };
}

export function isTouchDevice(): boolean {
  return (
    typeof window !== 'undefined' &&
    ('ontouchstart' in window || navigator.maxTouchPoints > 0) &&
    window.matchMedia('(pointer: coarse)').matches
  );
}

/** Attach global keyboard/mouse listeners; returns cleanup fn. */
export function attachInput(
  input: InputState,
  canvas: HTMLCanvasElement,
  handlers: { onPause: () => void; onScoreboard: (down: boolean) => void },
): () => void {
  const isTyping = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
  };
  const down = (e: KeyboardEvent) => {
    if (isTyping(e)) return;
    if (e.repeat) {
      if (e.code === 'Tab') e.preventDefault();
      return;
    }
    input.keys.add(e.code);
    switch (e.code) {
      case 'KeyR':
        input.reload = true;
        break;
      case 'KeyQ':
      case 'Digit1':
      case 'Digit2':
        input.swap = true;
        break;
      case 'KeyG':
      case 'Space':
        input.grenade = true;
        e.preventDefault();
        break;
      case 'KeyF':
      case 'KeyE':
        input.killstreak = true;
        break;
      case 'Escape':
      case 'KeyP':
        handlers.onPause();
        break;
      case 'Tab':
        handlers.onScoreboard(true);
        e.preventDefault();
        break;
    }
  };
  const up = (e: KeyboardEvent) => {
    input.keys.delete(e.code);
    if (e.code === 'Tab') {
      handlers.onScoreboard(false);
      e.preventDefault();
    }
  };
  const move = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    input.mouseX = e.clientX;
    input.mouseY = e.clientY;
  };
  const mdown = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    if (e.button === 0) input.mouseDown = true;
    if (e.button === 2) input.grenade = true;
    input.mouseX = e.clientX;
    input.mouseY = e.clientY;
  };
  const mup = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    if (e.button === 0) input.mouseDown = false;
  };
  const ctx = (e: Event) => e.preventDefault();
  const wheel = (e: WheelEvent) => {
    if (Math.abs(e.deltaY) > 5) input.swap = true;
  };
  const blur = () => {
    input.keys.clear();
    input.mouseDown = false;
  };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('pointermove', move);
  canvas.addEventListener('pointerdown', mdown);
  window.addEventListener('pointerup', mup);
  canvas.addEventListener('contextmenu', ctx);
  canvas.addEventListener('wheel', wheel, { passive: true });
  window.addEventListener('blur', blur);
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
    window.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerdown', mdown);
    window.removeEventListener('pointerup', mup);
    canvas.removeEventListener('contextmenu', ctx);
    canvas.removeEventListener('wheel', wheel);
    window.removeEventListener('blur', blur);
  };
}
