import {
  Component,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnDestroy,
  signal,
  computed,
  input,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FloatWindow } from '../float-window/float-window.component';
import { DraggableDirective } from '../../../directives/draggable.directive';
import { PixelIconComponent } from '../../shared/pixel-icon/pixel-icon.component';

type TabId = 'html' | 'css' | 'js';

interface ConsoleEntry {
  type: string;
  text: string;
}

const STARTER_HTML = `<div class="container">
  <h1>Hello, Playground!</h1>
  <p>Edit this code and see the result.</p>
  <button id="btn">Click me</button>
  <p id="output"></p>
</div>`;

const STARTER_CSS = `.container {
  font-family: sans-serif;
  padding: 20px;
  color: #e5e7eb;
}

h1 {
  color: #8b5cf6;
}

button {
  background: #8b5cf6;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

button:hover {
  background: #7c3aed;
}`;

const STARTER_JS = `const btn = document.getElementById('btn');
const output = document.getElementById('output');
let count = 0;

btn.addEventListener('click', () => {
  count++;
  output.textContent = \`Clicked \${count} time\${count === 1 ? '' : 's'}\`;
  console.log('Button clicked!', { count });
});

console.log('Playground loaded!');`;

const CONSOLE_CAPTURE_SCRIPT = `<script>
(function() {
  const _post = (type, args) => {
    try {
      parent.postMessage({
        source: 'playground-preview',
        type: type,
        args: Array.from(args).map(a => {
          try { if (typeof a === 'object') return JSON.stringify(a, null, 2); return String(a); }
          catch(e) { return String(a); }
        })
      }, '*');
    } catch(e) {}
  };
  console.log = function() { _post('log', arguments); };
  console.error = function() { _post('error', arguments); };
  console.warn = function() { _post('warn', arguments); };
  console.info = function() { _post('info', arguments); };
  window.onerror = function(msg, url, line) { _post('error', [msg + (line ? ' (line ' + line + ')' : '')]); };
})();
<\/script>`;

@Component({
  selector: 'app-code-playground-window',
  imports: [CommonModule, DraggableDirective, PixelIconComponent],
  templateUrl: 'code-playground-window.component.html',
  styleUrls: ['code-playground-window.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CodePlaygroundWindowComponent extends FloatWindow implements AfterViewInit, OnDestroy {
  override title = input<string>('Code Playground');

  @ViewChild('previewFrame') previewFrame!: ElementRef<HTMLIFrameElement>;

  private readonly cdr = inject(ChangeDetectorRef);

  // State signals
  activeTab = signal<TabId>('html');
  htmlCode = signal(STARTER_HTML);
  cssCode = signal(STARTER_CSS);
  jsCode = signal(STARTER_JS);
  autoRun = signal(true);
  consoleEntries = signal<ConsoleEntry[]>([]);

  // Derived state
  activeCode = computed(() => {
    switch (this.activeTab()) {
      case 'html': return this.htmlCode();
      case 'css': return this.cssCode();
      case 'js': return this.jsCode();
    }
  });

  srcdoc = computed(() => {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>${this.cssCode()}</style>
${CONSOLE_CAPTURE_SCRIPT}
</head>
<body>
${this.htmlCode()}
<script>${this.jsCode()}<\/script>
</body>
</html>`;
  });

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private messageHandler = (event: MessageEvent) => this.onMessage(event);

  constructor() {
    super();
    this.width.set(1000);
    this.height.set(700);
  }

  ngAfterViewInit(): void {
    window.addEventListener('message', this.messageHandler);
    this.runCode();
  }

  ngOnDestroy(): void {
    window.removeEventListener('message', this.messageHandler);
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
  }

  setTab(tab: TabId): void {
    this.activeTab.set(tab);
  }

  onCodeInput(event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    switch (this.activeTab()) {
      case 'html': this.htmlCode.set(value); break;
      case 'css': this.cssCode.set(value); break;
      case 'js': this.jsCode.set(value); break;
    }

    if (this.autoRun()) {
      this.debouncedRun();
    }
  }

  onTabKeydown(event: KeyboardEvent): void {
    if (event.key === 'Tab') {
      event.preventDefault();
      const textarea = event.target as HTMLTextAreaElement;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const value = textarea.value;
      const newValue = value.substring(0, start) + '  ' + value.substring(end);

      textarea.value = newValue;
      textarea.selectionStart = textarea.selectionEnd = start + 2;

      // Update signal with the new value
      switch (this.activeTab()) {
        case 'html': this.htmlCode.set(newValue); break;
        case 'css': this.cssCode.set(newValue); break;
        case 'js': this.jsCode.set(newValue); break;
      }
    }
  }

  toggleAutoRun(): void {
    this.autoRun.update(v => !v);
  }

  runCode(): void {
    if (this.previewFrame?.nativeElement) {
      this.previewFrame.nativeElement.srcdoc = this.srcdoc();
    }
  }

  clearConsole(): void {
    this.consoleEntries.set([]);
  }

  resetCode(): void {
    this.htmlCode.set(STARTER_HTML);
    this.cssCode.set(STARTER_CSS);
    this.jsCode.set(STARTER_JS);
    this.consoleEntries.set([]);
    this.runCode();
  }

  private debouncedRun(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.runCode();
    }, 400);
  }

  private onMessage(event: MessageEvent): void {
    const data = event.data;
    if (data?.source !== 'playground-preview') return;

    const entry: ConsoleEntry = {
      type: data.type,
      text: (data.args as string[]).join(' ')
    };

    this.consoleEntries.update(entries => [...entries, entry]);
    this.cdr.markForCheck();
  }
}
