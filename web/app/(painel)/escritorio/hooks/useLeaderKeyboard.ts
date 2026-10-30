import { useEffect } from 'react';

import type { OfficeState } from '../office/engine/officeState';

const KEY_NORMALIZE: Record<string, string> = {
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
  w: 'ArrowUp',
  W: 'ArrowUp',
  s: 'ArrowDown',
  S: 'ArrowDown',
  a: 'ArrowLeft',
  A: 'ArrowLeft',
  d: 'ArrowRight',
  D: 'ArrowRight',
  Shift: 'Shift',
};

function isTypingInField(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

export function useLeaderKeyboard(getOfficeState: () => OfficeState, isDisabled: boolean): void {
  useEffect(() => {
    if (isDisabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTypingInField(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const mapped = KEY_NORMALIZE[e.key];
      if (mapped) {
        if (mapped !== 'Shift') e.preventDefault();
        getOfficeState().leaderKeysDown.add(mapped);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const mapped = KEY_NORMALIZE[e.key];
      if (mapped) {
        getOfficeState().leaderKeysDown.delete(mapped);
      }
    };

    const handleBlur = () => {
      getOfficeState().leaderKeysDown.clear();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      getOfficeState().leaderKeysDown.clear();
    };
  }, [getOfficeState, isDisabled]);
}
