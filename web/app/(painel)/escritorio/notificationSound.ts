import {
  NOTIFICATION_NOTE_1_HZ,
  NOTIFICATION_NOTE_1_START_SEC,
  NOTIFICATION_NOTE_2_HZ,
  NOTIFICATION_NOTE_2_START_SEC,
  NOTIFICATION_NOTE_DURATION_SEC,
  NOTIFICATION_VOLUME,
} from './constants';

let soundEnabled = true;
let audioCtx: AudioContext | null = null;

export function setSoundEnabled(enabled: boolean): void {
  soundEnabled = enabled;
}

export function isSoundEnabled(): boolean {
  return soundEnabled;
}

function playNote(ctx: AudioContext, freq: number, startOffset: number): void {
  const t = ctx.currentTime + startOffset;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, t);

  gain.gain.setValueAtTime(NOTIFICATION_VOLUME, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + NOTIFICATION_NOTE_DURATION_SEC);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(t);
  osc.stop(t + NOTIFICATION_NOTE_DURATION_SEC);
}

export async function playDoneSound(): Promise<void> {
  if (!soundEnabled) return;
  try {
    if (!audioCtx) {
      audioCtx = new AudioContext();
    }
    // Resume suspended context (webviews suspend until user gesture)
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }
    // Ascending two-note chime: E5 → B5
    playNote(audioCtx, NOTIFICATION_NOTE_1_HZ, NOTIFICATION_NOTE_1_START_SEC);
    playNote(audioCtx, NOTIFICATION_NOTE_2_HZ, NOTIFICATION_NOTE_2_START_SEC);
  } catch {
    // Audio may not be available
  }
}

/** Som suave de clique retrô de tecla mecânica ao selecionar NPC ou interagir */
export async function playKeyClickSound(): Promise<void> {
  if (!soundEnabled) return;
  try {
    if (!audioCtx) {
      audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(620, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.035);

    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(t);
    osc.stop(t + 0.035);
  } catch {
    // ignore
  }
}

/** Alerta retrô 8-bit de prioridade alta (arpejo clássico) */
export async function playUrgentAlertSound(): Promise<void> {
  if (!soundEnabled) return;
  try {
    if (!audioCtx) {
      audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }
    const notas = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notas.forEach((freq, idx) => {
      if (!audioCtx) return;
      const t = audioCtx.currentTime + idx * 0.07;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.05, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(t);
      osc.stop(t + 0.08);
    });
  } catch {
    // ignore
  }
}

/** Call from any user-gesture handler to ensure AudioContext is unlocked */
export function unlockAudio(): void {
  try {
    if (!audioCtx) {
      audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  } catch {
    // ignore
  }
}
