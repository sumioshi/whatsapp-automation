'use client';

/**
 * Gerador procedural de música ambiente relaxante (Web Audio API)
 * Sem dependências externas — sintetiza acordes quentes de Rhodes Lo-Fi,
 * arpejos suaves de "flow / progresso", brisa do campo e sinos aconchegantes de Natal.
 */

export type AmbientStation = 'lofi' | 'campo' | 'natal';

export const AMBIENT_STATIONS: Array<{
  id: AmbientStation;
  label: string;
  shortLabel: string;
  emoji: string;
  desc: string;
}> = [
  {
    id: 'lofi',
    label: 'Lo-Fi Chill & Progresso',
    shortLabel: 'Lo-Fi Chill',
    emoji: '🎧',
    desc: 'Acordes de Rhodes quentes + arpejo de foco e fluxo contínuo',
  },
  {
    id: 'campo',
    label: 'Brisa do Campo & Riacho',
    shortLabel: 'Campo & Paz',
    emoji: '🌿',
    desc: 'Pad acústico pastoral + água corrente suave + harmônicos',
  },
  {
    id: 'natal',
    label: 'Natal Cozy & Luzes',
    shortLabel: 'Natal Cozy',
    emoji: '🎄',
    desc: 'Piano elétrico acolhedor + celesta cristalina de fim de ano',
  },
];

// Progressões harmônicas (frequências em Hz)
const PROGRESSIONS: Record<AmbientStation, number[][]> = {
  // Cmaj9 -> Am9 -> Fmaj9 -> G13 (clássica progressão de foco tranquilo e otimismo)
  lofi: [
    [130.81, 164.81, 196.0, 246.94, 293.66], // C3, E3, G3, B3, D4
    [110.0, 130.81, 164.81, 196.0, 246.94],  // A2, C3, E3, G3, B3
    [87.31, 130.81, 164.81, 196.0, 261.63],  // F2, C3, E3, G3, C4
    [98.0, 146.83, 174.61, 246.94, 329.63],  // G2, D3, F3, B3, E4
  ],
  // Fmaj9 -> Cmaj9 -> Dm9 -> C6/G (sensação de horizonte aberto, campo e manhã calma)
  campo: [
    [174.61, 220.0, 261.63, 329.63, 392.0],  // F3, A3, C4, E4, G4
    [130.81, 196.0, 246.94, 293.66, 329.63], // C3, G3, B3, D4, E4
    [146.83, 174.61, 220.0, 261.63, 329.63], // D3, F3, A3, C4, E4
    [98.0, 164.81, 196.0, 220.0, 293.66],    // G2, E3, G3, A3, D4
  ],
  // Cmaj9 -> Em7 -> Fmaj7(#11) -> Dm9 -> G13 (clima natalino nostálgico e quentinho)
  natal: [
    [130.81, 196.0, 246.94, 293.66, 329.63], // C3, G3, B3, D4, E4
    [164.81, 196.0, 246.94, 293.66, 392.0],  // E3, G3, B3, D4, G4
    [174.61, 220.0, 261.63, 329.63, 369.99], // F3, A3, C4, E4, F#4
    [146.83, 220.0, 261.63, 329.63, 392.0],  // D3, A3, C4, E4, G4
  ],
};

// Escalas melódicas pentatônicas / lídias para o arpejo de progresso
const MELODY_NOTES: Record<AmbientStation, number[]> = {
  lofi: [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25],
  campo: [349.23, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99],
  natal: [523.25, 587.33, 659.25, 783.99, 880.0, 987.77, 1046.5],
};

class AmbientMusicController {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private delayNode: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;
  private noiseNode: AudioNode | null = null;
  private noiseGain: GainNode | null = null;
  private chordTimer: ReturnType<typeof setInterval> | null = null;
  private melodyTimer: ReturnType<typeof setInterval> | null = null;
  private isPlaying = false;
  private station: AmbientStation = 'lofi';
  private chordIndex = 0;
  private melodyStep = 0;
  private volume = 0.24;

  public start(station?: AmbientStation): boolean {
    if (station) this.station = station;
    if (typeof window === 'undefined') return false;

    try {
      if (!this.ctx) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }

      if (this.isPlaying) {
        this.restartLoops();
        return true;
      }

      this.setupMasterGraph();
      this.startAmbienceTexture();
      this.isPlaying = true;
      this.chordIndex = 0;
      this.melodyStep = 0;

      // Toca o primeiro acorde imediatamente
      this.triggerChord();
      this.restartLoops();
      return true;
    } catch {
      return false;
    }
  }

  public stop(): void {
    this.isPlaying = false;
    if (this.chordTimer) {
      clearInterval(this.chordTimer);
      this.chordTimer = null;
    }
    if (this.melodyTimer) {
      clearInterval(this.melodyTimer);
      this.melodyTimer = null;
    }
    if (this.noiseNode) {
      try {
        (this.noiseNode as AudioBufferSourceNode).stop();
      } catch {
        // ignore
      }
      this.noiseNode.disconnect();
      this.noiseNode = null;
    }
    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(0.0001, now, 0.25);
    }
  }

  public setStation(station: AmbientStation): void {
    this.station = station;
    this.chordIndex = 0;
    this.melodyStep = 0;
    if (this.isPlaying) {
      this.triggerChord();
      this.restartLoops();
    }
  }

  public getState(): { isPlaying: boolean; station: AmbientStation; volume: number } {
    return {
      isPlaying: this.isPlaying,
      station: this.station,
      volume: this.volume,
    };
  }

  private setupMasterGraph(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    if (!this.masterGain) {
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.001, now);
      this.masterGain.connect(this.ctx.destination);

      // Delay suave estéreo para dar profundidade espacial ("relax + progresso")
      this.delayNode = this.ctx.createDelay(1.0);
      this.delayNode.delayTime.setValueAtTime(0.38, now);
      this.delayFeedback = this.ctx.createGain();
      this.delayFeedback.gain.setValueAtTime(0.28, now);

      const delayFilter = this.ctx.createBiquadFilter();
      delayFilter.type = 'lowpass';
      delayFilter.frequency.setValueAtTime(1400, now);

      this.delayNode.connect(delayFilter);
      delayFilter.connect(this.delayFeedback);
      this.delayFeedback.connect(this.delayNode);
      delayFilter.connect(this.masterGain);
    }

    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setTargetAtTime(this.volume, now, 0.6);
  }

  /**
   * Cria textura sutil de vinil/brisa/riacho ao fundo (ruído rosa filtrado)
   */
  private startAmbienceTexture(): void {
    if (!this.ctx || !this.masterGain) return;
    if (this.noiseNode) {
      try {
        (this.noiseNode as AudioBufferSourceNode).stop();
      } catch {
        // ignore
      }
      this.noiseNode.disconnect();
    }

    const bufferSize = this.ctx.sampleRate * 4;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);

    // Pink noise approximation (Paul Kellet's filter)
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.03;
      b6 = white * 0.115926;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = this.station === 'campo' ? 650 : 950;
    filter.Q.value = 0.7;

    this.noiseGain = this.ctx.createGain();
    this.noiseGain.gain.value = this.station === 'campo' ? 0.045 : 0.022;

    noise.connect(filter);
    filter.connect(this.noiseGain);
    this.noiseGain.connect(this.masterGain);
    noise.start();
    this.noiseNode = noise;
  }

  private restartLoops(): void {
    if (this.chordTimer) clearInterval(this.chordTimer);
    if (this.melodyTimer) clearInterval(this.melodyTimer);

    // Acorde a cada 4.8 segundos (andamento ~50 BPM bem calmo)
    this.chordTimer = setInterval(() => {
      if (!this.isPlaying) return;
      this.triggerChord();
    }, 4800);

    // Notas suaves de arpejo/progresso a cada 800ms
    this.melodyTimer = setInterval(() => {
      if (!this.isPlaying) return;
      this.triggerMelodyNote();
    }, 800);
  }

  private triggerChord(): void {
    if (!this.ctx || !this.masterGain) return;
    const prog = PROGRESSIONS[this.station];
    const chord = prog[this.chordIndex % prog.length];
    this.chordIndex = (this.chordIndex + 1) % prog.length;

    const now = this.ctx.currentTime;
    const duration = 4.9;

    chord.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      // Strum suave nas notas do acorde (efeito harpa/piano humano)
      const noteStart = now + idx * 0.055;

      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      osc1.type = 'sine';
      osc2.type = 'triangle';

      osc1.frequency.setValueAtTime(freq, noteStart);
      osc2.frequency.setValueAtTime(freq, noteStart);
      // Leve detune estilo tape-warmth lo-fi
      osc1.detune.setValueAtTime(-4, noteStart);
      osc2.detune.setValueAtTime(4, noteStart);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      const baseCutoff = this.station === 'campo' ? 1100 : this.station === 'natal' ? 1250 : 880;
      filter.frequency.setValueAtTime(baseCutoff + idx * 90, noteStart);
      filter.frequency.exponentialRampToValueAtTime(340, noteStart + duration);

      const noteGain = this.ctx.createGain();
      const peakGain = idx === 0 ? 0.14 : 0.085;
      noteGain.gain.setValueAtTime(0.0001, noteStart);
      noteGain.gain.linearRampToValueAtTime(peakGain, noteStart + 0.35);
      noteGain.gain.exponentialRampToValueAtTime(peakGain * 0.45, noteStart + 2.2);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, noteStart + duration);

      const osc2Gain = this.ctx.createGain();
      osc2Gain.gain.setValueAtTime(0.28, noteStart);

      osc1.connect(filter);
      osc2.connect(osc2Gain);
      osc2Gain.connect(filter);
      filter.connect(noteGain);
      noteGain.connect(this.masterGain);
      if (this.delayNode && idx >= 2) {
        noteGain.connect(this.delayNode);
      }

      osc1.start(noteStart);
      osc2.start(noteStart);
      osc1.stop(noteStart + duration + 0.05);
      osc2.stop(noteStart + duration + 0.05);
    });
  }

  private triggerMelodyNote(): void {
    if (!this.ctx || !this.masterGain) return;
    this.melodyStep++;

    // Espaçamento respirável: toca em alguns tempos e deixa pausa em outros
    const pattern = [1, 0, 1, 1, 0, 1, 0, 0];
    if (pattern[this.melodyStep % pattern.length] === 0) return;

    const scale = MELODY_NOTES[this.station];
    // Movimento melódico ascendente suave (sensação de progresso calmo)
    const idx = (this.melodyStep + this.chordIndex * 2) % scale.length;
    const freq = scale[idx];

    const now = this.ctx.currentTime;
    const duration = this.station === 'natal' ? 1.8 : 1.45;

    const osc = this.ctx.createOscillator();
    osc.type = this.station === 'natal' ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(freq, now);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(this.station === 'natal' ? 2400 : 1500, now);
    filter.frequency.exponentialRampToValueAtTime(480, now + duration);

    const gain = this.ctx.createGain();
    const peak = this.station === 'natal' ? 0.065 : 0.05;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    if (this.delayNode) {
      gain.connect(this.delayNode);
    }

    osc.start(now);
    osc.stop(now + duration + 0.05);

    // Se for estação de Natal, adiciona harmônico de celesta/sininho uma oitava acima
    if (this.station === 'natal') {
      const bell = this.ctx.createOscillator();
      const bellGain = this.ctx.createGain();
      bell.type = 'sine';
      bell.frequency.setValueAtTime(freq * 2, now);
      bellGain.gain.setValueAtTime(0.0001, now);
      bellGain.gain.linearRampToValueAtTime(0.022, now + 0.02);
      bellGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);
      bell.connect(bellGain);
      bellGain.connect(this.masterGain);
      if (this.delayNode) bellGain.connect(this.delayNode);
      bell.start(now);
      bell.stop(now + 0.8);
    }
  }
}

let singleton: AmbientMusicController | null = null;

export function getAmbientMusic(): AmbientMusicController {
  if (!singleton) {
    singleton = new AmbientMusicController();
  }
  return singleton;
}
