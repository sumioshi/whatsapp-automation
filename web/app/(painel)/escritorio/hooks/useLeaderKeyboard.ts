import { useEffect } from 'react';

import type { OfficeState } from '../office/engine/officeState';

const TRACKED_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Shift']);

export function useLeaderKeyboard(getOfficeState: () => OfficeState, isEditMode: boolean): void {
  useEffect(() => {
    if (isEditMode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (TRACKED_KEYS.has(e.key)) {
        if (e.key !== 'Shift') e.preventDefault();
        getOfficeState().leaderKeysDown.add(e.key);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (TRACKED_KEYS.has(e.key)) {
        getOfficeState().leaderKeysDown.delete(e.key);
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
  }, [getOfficeState, isEditMode]);
}
