import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  input,
  OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FloatWindow } from '../float-window/float-window.component';
import { DraggableDirective } from '../../../directives/draggable.directive';

type Direction = 'text-to-morse' | 'morse-to-text';

const MORSE_MAP: Record<string, string> = {
  'A': '.-',    'B': '-...',  'C': '-.-.',  'D': '-..',
  'E': '.',     'F': '..-.',  'G': '--.',   'H': '....',
  'I': '..',    'J': '.---',  'K': '-.-',   'L': '.-..',
  'M': '--',    'N': '-.',    'O': '---',   'P': '.--.',
  'Q': '--.-',  'R': '.-.',   'S': '...',   'T': '-',
  'U': '..-',   'V': '...-',  'W': '.--',   'X': '-..-',
  'Y': '-.--',  'Z': '--..',
  '0': '-----', '1': '.----', '2': '..---', '3': '...--',
  '4': '....-', '5': '.....', '6': '-....', '7': '--...',
  '8': '---..', '9': '----.'
};

const REVERSE_MORSE_MAP: Record<string, string> = Object.entries(MORSE_MAP).reduce(
  (acc, [char, code]) => ({ ...acc, [code]: char }),
  {} as Record<string, string>
);

const REFERENCE_ENTRIES = Object.entries(MORSE_MAP).map(([char, code]) => ({ char, code }));

@Component({
  selector: 'app-morse-code-window',
  imports: [CommonModule, FormsModule, DraggableDirective],
  templateUrl: './morse-code-window.component.html',
  styleUrls: ['./morse-code-window.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MorseCodeWindowComponent extends FloatWindow implements OnDestroy {
  override title = input<string>('Morse Code');

  direction = signal<Direction>('text-to-morse');
  textInput = signal('');
  morseInput = signal('');
  wpm = signal(15);
  isPlaying = signal(false);
  referenceOpen = signal(false);

  readonly referenceEntries = REFERENCE_ENTRIES;

  morseOutput = computed(() => {
    const text = this.textInput().toUpperCase();
    return text
      .split('')
      .map(char => {
        if (char === ' ') return '/';
        return MORSE_MAP[char] ?? '';
      })
      .filter(code => code !== '')
      .join(' ');
  });

  textOutput = computed(() => {
    const morse = this.morseInput().trim();
    if (!morse) return '';
    return morse
      .split(' / ')
      .map(word =>
        word
          .split(' ')
          .map(code => REVERSE_MORSE_MAP[code] ?? '?')
          .join('')
      )
      .join(' ');
  });

  private audioContext: AudioContext | null = null;
  private playbackTimeout: ReturnType<typeof setTimeout> | null = null;
  private scheduledTimeouts: ReturnType<typeof setTimeout>[] = [];
  private activeOscillators: OscillatorNode[] = [];

  constructor() {
    super();
    this.width.set(800);
    this.height.set(600);
  }

  ngOnDestroy(): void {
    this.stopPlayback();
    this.audioContext?.close();
  }

  setDirection(dir: Direction): void {
    this.direction.set(dir);
  }

  onTextInput(value: string): void {
    this.textInput.set(value);
  }

  onMorseInput(value: string): void {
    this.morseInput.set(value);
  }

  onWpmChange(value: number): void {
    this.wpm.set(value);
  }

  toggleReference(): void {
    this.referenceOpen.update(v => !v);
  }

  copyMorseOutput(): void {
    const output = this.morseOutput();
    if (output) {
      navigator.clipboard.writeText(output);
    }
  }

  copyTextOutput(): void {
    const output = this.textOutput();
    if (output) {
      navigator.clipboard.writeText(output);
    }
  }

  playMorse(): void {
    const morse = this.direction() === 'text-to-morse'
      ? this.morseOutput()
      : this.morseInput();

    if (!morse || this.isPlaying()) return;

    this.isPlaying.set(true);

    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }

    const dotDuration = 1200 / this.wpm();
    const dashDuration = dotDuration * 3;
    const symbolGap = dotDuration;
    const letterGap = dotDuration * 3;
    const wordGap = dotDuration * 7;

    let currentTime = this.audioContext.currentTime + 0.05;
    const ctx = this.audioContext;

    for (const symbol of morse) {
      if (symbol === '.') {
        this.playTone(ctx, currentTime, dotDuration / 1000);
        currentTime += dotDuration / 1000 + symbolGap / 1000;
      } else if (symbol === '-') {
        this.playTone(ctx, currentTime, dashDuration / 1000);
        currentTime += dashDuration / 1000 + symbolGap / 1000;
      } else if (symbol === '/') {
        currentTime += (wordGap - symbolGap) / 1000;
      } else if (symbol === ' ') {
        currentTime += (letterGap - symbolGap) / 1000;
      }
    }

    const totalDurationMs = (currentTime - this.audioContext.currentTime) * 1000;
    this.playbackTimeout = setTimeout(() => {
      this.isPlaying.set(false);
    }, totalDurationMs + 100);
    this.scheduledTimeouts.push(this.playbackTimeout);
  }

  stopPlayback(): void {
    this.isPlaying.set(false);
    for (const t of this.scheduledTimeouts) {
      clearTimeout(t);
    }
    this.scheduledTimeouts = [];
    this.playbackTimeout = null;
    for (const osc of this.activeOscillators) {
      osc.stop();
    }
    this.activeOscillators = [];
  }

  private playTone(ctx: AudioContext, startTime: number, duration: number): void {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(600, startTime);

    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(0.5, startTime + 0.005);
    gainNode.gain.setValueAtTime(0.5, startTime + duration - 0.005);
    gainNode.gain.linearRampToValueAtTime(0, startTime + duration);

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.start(startTime);
    oscillator.stop(startTime + duration);

    this.activeOscillators.push(oscillator);
    oscillator.onended = () => {
      const idx = this.activeOscillators.indexOf(oscillator);
      if (idx !== -1) {
        this.activeOscillators.splice(idx, 1);
      }
    };
  }
}
