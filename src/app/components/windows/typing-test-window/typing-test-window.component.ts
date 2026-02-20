import {
  Component,
  signal,
  computed,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  OnDestroy,
  ElementRef,
  ViewChild,
  input,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FloatWindow } from '../float-window/float-window.component';
import { DraggableDirective } from '../../../directives/draggable.directive';
import { PixelIconComponent } from '../../shared/pixel-icon/pixel-icon.component';

const STORAGE_KEY = 'corvid_typing_test_bests';

const TEXT_SAMPLES: string[] = [
  'It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness, it was the epoch of belief, it was the epoch of incredulity, it was the season of Light, it was the season of Darkness, it was the spring of hope, it was the winter of despair.',
  'All happy families are alike; each unhappy family is unhappy in its own way. Everything was in confusion in the Oblonskys house. The wife had discovered that the husband was carrying on an intrigue with a French girl, who had been a governess in their family.',
  'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife. However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families.',
  'In my younger and more vulnerable years my father gave me some advice that I have been turning over in my mind ever since. Whenever you feel like criticizing anyone, he told me, just remember that all the people in this world have not had the advantages that you have had.',
  'Many years later, as he faced the firing squad, Colonel Aureliano Buendia was to remember that distant afternoon when his father took him to discover ice. At that time Macondo was a village of twenty adobe houses, built on the bank of a river of clear water.',
  'It was a bright cold day in April, and the clocks were striking thirteen. Winston Smith, his chin nuzzled into his breast in an effort to escape the vile wind, slipped quickly through the glass doors of Victory Mansions, though not quickly enough to prevent a swirl of gritty dust from entering along with him.',
  'The sky above the port was the color of television, tuned to a dead channel. All this happened, more or less. I was not sorry when my brother died. It was a pleasure to burn. It was a special pleasure to see things eaten, to see things blackened and changed.',
  'Far out in the uncharted backwaters of the unfashionable end of the Western Spiral arm of the Galaxy lies a small unregarded yellow sun. Orbiting this at a distance of roughly ninety-two million miles is an utterly insignificant little blue-green planet whose life forms are so amazingly primitive.',
  'Call me Ishmael. Some years ago, never mind how long precisely, having little or no money in my purse, and nothing particular to interest me on shore, I thought I would sail about a little and see the watery part of the world. It is a way I have of driving off the spleen.',
  'Mr and Mrs Dursley, of number four, Privet Drive, were proud to say that they were perfectly normal, thank you very much. They were the last people you would expect to be involved in anything strange or mysterious, because they just did not hold with such nonsense.'
];

interface PersonalBests {
  [seconds: number]: { wpm: number; accuracy: number };
}

const KEYBOARD_ROWS: string[][] = [
  ['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']', '\\'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', '\''],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/']
];

@Component({
  selector: 'app-typing-test-window',
  imports: [CommonModule, DraggableDirective, PixelIconComponent],
  templateUrl: 'typing-test-window.component.html',
  styleUrls: ['typing-test-window.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:keydown)': 'handleKeyDown($event)',
    '(window:keyup)': 'handleKeyUp($event)'
  }
})
export class TypingTestWindowComponent extends FloatWindow implements OnDestroy {
  @ViewChild('hiddenInput', { static: false }) hiddenInputRef!: ElementRef<HTMLInputElement>;

  private readonly cdr = inject(ChangeDetectorRef);

  override title = input<string>('Typing Test');

  // Time options
  readonly timeOptions = [30, 60, 120];

  // State signals
  selectedTime = signal(60);
  timeLeft = signal(60);
  testStarted = signal(false);
  testFinished = signal(false);
  currentIndex = signal(0);
  errors = signal(0);
  totalTyped = signal(0);
  correctTyped = signal(0);
  charStates = signal<string[]>([]);
  currentText = signal('');
  activeKey = signal('');

  // Personal bests
  personalBests = signal<PersonalBests>({});

  // Computed values
  wpm = computed(() => {
    const timeElapsed = this.selectedTime() - this.timeLeft();
    if (timeElapsed <= 0) return 0;
    const minutes = timeElapsed / 60;
    // Standard: 1 word = 5 characters
    return Math.round((this.correctTyped() / 5) / minutes);
  });

  accuracy = computed(() => {
    if (this.totalTyped() === 0) return 100;
    return Math.round((this.correctTyped() / this.totalTyped()) * 100);
  });

  // Keyboard layout
  readonly keyboardRows = KEYBOARD_ROWS;

  private timerInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super();
    this.width.set(850);
    this.height.set(650);
    this.loadPersonalBests();
    this.pickNewText();
  }

  ngOnDestroy(): void {
    this.clearTimer();
  }

  selectTime(seconds: number): void {
    if (this.testStarted() && !this.testFinished()) return;
    this.selectedTime.set(seconds);
    this.resetTest();
  }

  resetTest(): void {
    this.clearTimer();
    this.timeLeft.set(this.selectedTime());
    this.testStarted.set(false);
    this.testFinished.set(false);
    this.currentIndex.set(0);
    this.errors.set(0);
    this.totalTyped.set(0);
    this.correctTyped.set(0);
    this.pickNewText();
    this.focusInput();
  }

  focusInput(): void {
    setTimeout(() => {
      this.hiddenInputRef?.nativeElement?.focus();
    });
  }

  handleKeyDown(event: KeyboardEvent): void {
    // Track active key for keyboard highlight
    const key = event.key.toLowerCase();
    this.activeKey.set(key);

    // Don't process if test is finished
    if (this.testFinished()) return;

    // Ignore modifier-only keys
    if (['shift', 'control', 'alt', 'meta', 'capslock', 'tab', 'escape'].includes(key)) return;

    // Handle backspace
    if (key === 'backspace') {
      event.preventDefault();
      if (this.currentIndex() > 0) {
        const newIndex = this.currentIndex() - 1;
        this.currentIndex.set(newIndex);
        this.charStates.update(states => {
          const copy = [...states];
          copy[newIndex] = 'pending';
          return copy;
        });
      }
      return;
    }

    // Only process printable characters
    if (event.key.length !== 1) return;
    event.preventDefault();

    // Start timer on first keystroke
    if (!this.testStarted()) {
      this.startTimer();
      this.testStarted.set(true);
    }

    const text = this.currentText();
    const idx = this.currentIndex();

    if (idx >= text.length) return;

    this.totalTyped.update(n => n + 1);

    const expected = text[idx];
    const typed = event.key;

    if (typed === expected) {
      this.correctTyped.update(n => n + 1);
      this.charStates.update(states => {
        const copy = [...states];
        copy[idx] = 'correct';
        return copy;
      });
    } else {
      this.errors.update(n => n + 1);
      this.charStates.update(states => {
        const copy = [...states];
        copy[idx] = 'incorrect';
        return copy;
      });
    }

    this.currentIndex.update(n => n + 1);

    // If we reached the end of the text, finish the test
    if (this.currentIndex() >= text.length) {
      this.finishTest();
    }
  }

  handleKeyUp(_event: KeyboardEvent): void {
    this.activeKey.set('');
  }

  getCharState(index: number): string {
    const states = this.charStates();
    if (index < states.length && states[index] !== 'pending') {
      return states[index];
    }
    if (index === this.currentIndex()) {
      return 'current';
    }
    return 'dim';
  }

  isKeyActive(key: string): boolean {
    return this.activeKey() === key.toLowerCase();
  }

  getBestWpm(seconds: number): number {
    return this.personalBests()[seconds]?.wpm ?? 0;
  }

  getBestAccuracy(seconds: number): number {
    return this.personalBests()[seconds]?.accuracy ?? 0;
  }

  getTextChars(): string[] {
    return this.currentText().split('');
  }

  private startTimer(): void {
    this.clearTimer();
    this.timerInterval = setInterval(() => {
      this.timeLeft.update(t => t - 1);
      if (this.timeLeft() <= 0) {
        this.finishTest();
      }
      this.cdr.markForCheck();
    }, 1000);
  }

  private finishTest(): void {
    this.clearTimer();
    this.testFinished.set(true);
    this.savePersonalBest();
    this.cdr.markForCheck();
  }

  private clearTimer(): void {
    if (this.timerInterval !== null) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private pickNewText(): void {
    const randomIndex = Math.floor(Math.random() * TEXT_SAMPLES.length);
    const text = TEXT_SAMPLES[randomIndex];
    this.currentText.set(text);
    this.charStates.set(new Array(text.length).fill('pending'));
  }

  private loadPersonalBests(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.personalBests.set(JSON.parse(stored));
      }
    } catch {
      // Ignore localStorage errors
    }
  }

  private savePersonalBest(): void {
    const seconds = this.selectedTime();
    const currentWpm = this.wpm();
    const currentAccuracy = this.accuracy();
    const bests = { ...this.personalBests() };

    if (!bests[seconds] || currentWpm > bests[seconds].wpm) {
      bests[seconds] = { wpm: currentWpm, accuracy: currentAccuracy };
      this.personalBests.set(bests);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(bests));
      } catch {
        // Ignore localStorage errors
      }
    }
  }
}
