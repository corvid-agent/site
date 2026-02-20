import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  inject,
  OnInit,
  OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { FloatWindow } from '../float-window/float-window.component';
import { DraggableDirective } from '../../../directives/draggable.directive';
import { PixelIconComponent } from '../../shared/pixel-icon/pixel-icon.component';

interface WikiPage {
  content: string;
  created: number;
  modified: number;
}

type ModalMode = 'new' | 'rename';

const STORAGE_PAGES_KEY = 'markdown_wiki_pages';
const STORAGE_ACTIVE_KEY = 'markdown_wiki_active';

const WELCOME_CONTENT = `# Welcome to the Markdown Wiki

This is your personal wiki with **full markdown support** and [[Wiki Links]]!

## Getting Started

- Use the **sidebar** to browse and manage pages
- Click **New Page** to create a new wiki page
- Use \`[[Page Name]]\` syntax to link between pages
- Press \`Ctrl+S\` to save, \`Ctrl+N\` to create a new page

## Markdown Features

### Text Formatting

- **Bold text** using \`**text**\`
- *Italic text* using \`*text*\`
- ~~Strikethrough~~ using \`~~text~~\`
- \`Inline code\` using backticks

### Links and Images

- [External links](https://example.com) using \`[text](url)\`
- Wiki links using \`[[Page Name]]\`
- Images using \`![alt](url)\`

### Code Blocks

\`\`\`javascript
function hello() {
  console.log("Hello, Wiki!");
}
\`\`\`

### Blockquotes

> This is a blockquote.
> It can span multiple lines.

### Lists

1. First ordered item
2. Second ordered item
3. Third ordered item

- Unordered item
- Another item
- Yet another item

---

Happy writing!
`;

@Component({
  selector: 'app-markdown-wiki-window',
  imports: [CommonModule, FormsModule, DraggableDirective, PixelIconComponent],
  templateUrl: './markdown-wiki-window.component.html',
  styleUrls: ['./markdown-wiki-window.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MarkdownWikiWindowComponent extends FloatWindow implements OnInit, OnDestroy {
  private sanitizer = inject(DomSanitizer);

  // State signals
  pages = signal<Record<string, WikiPage>>({});
  currentPage = signal<string>('Welcome');
  editorContent = signal<string>('');
  searchFilter = signal<string>('');
  sidebarOpen = signal<boolean>(true);
  modalOpen = signal<boolean>(false);
  modalMode = signal<ModalMode>('new');
  modalInput = signal<string>('');
  toastMessage = signal<string>('');
  toastVisible = signal<boolean>(false);

  private toastTimeout: ReturnType<typeof setTimeout> | null = null;
  private keydownHandler = (e: KeyboardEvent) => this.onKeydown(e);

  // Computed: filtered page list
  filteredPages = computed(() => {
    const allPages = this.pages();
    const filter = this.searchFilter().toLowerCase().trim();
    const pageNames = Object.keys(allPages).sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase())
    );
    if (!filter) return pageNames;
    return pageNames.filter(name => name.toLowerCase().includes(filter));
  });

  // Computed: rendered markdown preview
  renderedPreview = computed<SafeHtml>(() => {
    const raw = this.editorContent();
    const html = this.parseMarkdown(raw);
    return this.sanitizer.bypassSecurityTrustHtml(html);
  });

  constructor() {
    super();
    this.width.set(1000);
    this.height.set(700);
  }

  ngOnInit(): void {
    this.loadFromStorage();
    document.addEventListener('keydown', this.keydownHandler);
  }

  ngOnDestroy(): void {
    document.removeEventListener('keydown', this.keydownHandler);
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }
  }

  // --- Persistence ---

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_PAGES_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, WikiPage>;
        this.pages.set(parsed);
      } else {
        // Seed with welcome page
        const now = Date.now();
        const seed: Record<string, WikiPage> = {
          'Welcome': { content: WELCOME_CONTENT, created: now, modified: now }
        };
        this.pages.set(seed);
        this.saveToStorage();
      }

      const activePage = localStorage.getItem(STORAGE_ACTIVE_KEY);
      if (activePage && this.pages()[activePage]) {
        this.currentPage.set(activePage);
      } else {
        const firstPage = Object.keys(this.pages())[0] ?? 'Welcome';
        this.currentPage.set(firstPage);
      }

      this.editorContent.set(this.pages()[this.currentPage()]?.content ?? '');
    } catch {
      const now = Date.now();
      this.pages.set({
        'Welcome': { content: WELCOME_CONTENT, created: now, modified: now }
      });
      this.currentPage.set('Welcome');
      this.editorContent.set(WELCOME_CONTENT);
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_PAGES_KEY, JSON.stringify(this.pages()));
      localStorage.setItem(STORAGE_ACTIVE_KEY, this.currentPage());
    } catch {
      this.showToast('Failed to save to localStorage');
    }
  }

  // --- Page Operations ---

  selectPage(name: string): void {
    // Save current page content before switching
    this.saveCurrentPageContent();

    this.currentPage.set(name);
    this.editorContent.set(this.pages()[name]?.content ?? '');
    localStorage.setItem(STORAGE_ACTIVE_KEY, name);
  }

  savePage(): void {
    this.saveCurrentPageContent();
    this.saveToStorage();
    this.showToast('Page saved');
  }

  private saveCurrentPageContent(): void {
    const name = this.currentPage();
    const currentPages = this.pages();
    const existing = currentPages[name];
    if (existing) {
      this.pages.set({
        ...currentPages,
        [name]: {
          ...existing,
          content: this.editorContent(),
          modified: Date.now()
        }
      });
    }
  }

  deletePage(): void {
    const name = this.currentPage();
    const currentPages = { ...this.pages() };
    const pageNames = Object.keys(currentPages);

    if (pageNames.length <= 1) {
      this.showToast('Cannot delete the last page');
      return;
    }

    delete currentPages[name];
    this.pages.set(currentPages);

    const remaining = Object.keys(currentPages);
    const nextPage = remaining[0] ?? 'Welcome';
    this.currentPage.set(nextPage);
    this.editorContent.set(currentPages[nextPage]?.content ?? '');

    this.saveToStorage();
    this.showToast(`Deleted "${name}"`);
  }

  // --- Modal Operations ---

  openNewPageModal(): void {
    this.modalMode.set('new');
    this.modalInput.set('');
    this.modalOpen.set(true);
  }

  openRenameModal(): void {
    this.modalMode.set('rename');
    this.modalInput.set(this.currentPage());
    this.modalOpen.set(true);
  }

  closeModal(): void {
    this.modalOpen.set(false);
    this.modalInput.set('');
  }

  confirmModal(): void {
    const input = this.modalInput().trim();
    if (!input) {
      this.showToast('Page name cannot be empty');
      return;
    }

    if (this.modalMode() === 'new') {
      this.createPage(input);
    } else {
      this.renamePage(input);
    }

    this.closeModal();
  }

  private createPage(name: string): void {
    const currentPages = this.pages();
    if (currentPages[name]) {
      this.selectPage(name);
      this.showToast(`Switched to existing page "${name}"`);
      return;
    }

    this.saveCurrentPageContent();

    const now = Date.now();
    this.pages.set({
      ...currentPages,
      [name]: { content: `# ${name}\n\nStart writing here...`, created: now, modified: now }
    });

    this.currentPage.set(name);
    this.editorContent.set(`# ${name}\n\nStart writing here...`);
    this.saveToStorage();
    this.showToast(`Created "${name}"`);
  }

  private renamePage(newName: string): void {
    const oldName = this.currentPage();
    if (newName === oldName) return;

    const currentPages = this.pages();
    if (currentPages[newName]) {
      this.showToast(`A page named "${newName}" already exists`);
      return;
    }

    const page = currentPages[oldName];
    if (!page) return;

    const updated = { ...currentPages };
    delete updated[oldName];
    updated[newName] = { ...page, modified: Date.now() };

    this.pages.set(updated);
    this.currentPage.set(newName);
    this.saveToStorage();
    this.showToast(`Renamed "${oldName}" to "${newName}"`);
  }

  // --- Export ---

  exportPage(): void {
    const name = this.currentPage();
    const content = this.editorContent();
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${name}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
    this.showToast(`Exported "${name}.md"`);
  }

  // --- Wiki Link Navigation ---

  onPreviewClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (target.tagName === 'A' && target.dataset['wikiLink']) {
      event.preventDefault();
      const pageName = target.dataset['wikiLink'];
      if (pageName) {
        this.navigateToWikiPage(pageName);
      }
    }
  }

  private navigateToWikiPage(name: string): void {
    const currentPages = this.pages();
    if (!currentPages[name]) {
      // Create the page if it does not exist
      const now = Date.now();
      this.pages.set({
        ...currentPages,
        [name]: { content: `# ${name}\n\nThis page was created from a wiki link.`, created: now, modified: now }
      });
      this.saveToStorage();
    }
    this.selectPage(name);
  }

  // --- Editor ---

  onEditorInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.editorContent.set(target.value);
  }

  onTitleInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    const newName = target.value.trim();
    if (newName && newName !== this.currentPage()) {
      this.renamePage(newName);
    }
  }

  toggleSidebar(): void {
    this.sidebarOpen.update(v => !v);
  }

  // --- Keyboard Shortcuts ---

  private onKeydown(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey) {
      if (event.key === 's') {
        event.preventDefault();
        this.savePage();
      } else if (event.key === 'n') {
        event.preventDefault();
        this.openNewPageModal();
      }
    }

    if (event.key === 'Escape' && this.modalOpen()) {
      this.closeModal();
    }
  }

  // --- Toast ---

  private showToast(message: string): void {
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }
    this.toastMessage.set(message);
    this.toastVisible.set(true);
    this.toastTimeout = setTimeout(() => {
      this.toastVisible.set(false);
    }, 2500);
  }

  // --- Markdown Parser ---

  private parseMarkdown(markdown: string): string {
    if (!markdown) return '';

    // Store code blocks to protect them from other transformations
    const codeBlocks: string[] = [];

    // 1. Fenced code blocks (``` with optional language)
    let html = markdown.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang: string, code: string) => {
      const escaped = this.escapeHtml(code.replace(/\n$/, ''));
      const langAttr = lang ? ` class="language-${lang}"` : '';
      const placeholder = `%%CODEBLOCK_${codeBlocks.length}%%`;
      codeBlocks.push(`<pre><code${langAttr}>${escaped}</code></pre>`);
      return placeholder;
    });

    // 2. Inline code
    html = html.replace(/`([^`\n]+)`/g, (_match, code: string) => {
      return `<code>${this.escapeHtml(code)}</code>`;
    });

    // Process line-by-line for block elements
    const lines = html.split('\n');
    const output: string[] = [];
    let inList = false;
    let listType = '';
    let inBlockquote = false;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // Check for code block placeholders - pass through directly
      if (line.match(/%%CODEBLOCK_\d+%%/)) {
        if (inList) { output.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
        if (inBlockquote) { output.push('</blockquote>'); inBlockquote = false; }
        output.push(line);
        continue;
      }

      // 3. Headings (# through ######)
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        if (inList) { output.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
        if (inBlockquote) { output.push('</blockquote>'); inBlockquote = false; }
        const level = headingMatch[1].length;
        output.push(`<h${level}>${this.parseInline(headingMatch[2])}</h${level}>`);
        continue;
      }

      // 7. Horizontal rules (--- or ***)
      if (line.match(/^(\*{3,}|-{3,})$/)) {
        if (inList) { output.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
        if (inBlockquote) { output.push('</blockquote>'); inBlockquote = false; }
        output.push('<hr>');
        continue;
      }

      // 4. Blockquotes (>)
      const blockquoteMatch = line.match(/^>\s?(.*)$/);
      if (blockquoteMatch) {
        if (inList) { output.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
        if (!inBlockquote) {
          output.push('<blockquote>');
          inBlockquote = true;
        }
        output.push(`<p>${this.parseInline(blockquoteMatch[1])}</p>`);
        continue;
      } else if (inBlockquote) {
        output.push('</blockquote>');
        inBlockquote = false;
      }

      // 5. Unordered lists (- or * or +)
      const ulMatch = line.match(/^[\s]*[-*+]\s+(.+)$/);
      if (ulMatch) {
        if (inList && listType !== 'ul') {
          output.push('</ol>');
          inList = false;
        }
        if (!inList) {
          output.push('<ul>');
          inList = true;
          listType = 'ul';
        }
        output.push(`<li>${this.parseInline(ulMatch[1])}</li>`);
        continue;
      }

      // 6. Ordered lists (1.)
      const olMatch = line.match(/^[\s]*\d+\.\s+(.+)$/);
      if (olMatch) {
        if (inList && listType !== 'ol') {
          output.push('</ul>');
          inList = false;
        }
        if (!inList) {
          output.push('<ol>');
          inList = true;
          listType = 'ol';
        }
        output.push(`<li>${this.parseInline(olMatch[1])}</li>`);
        continue;
      }

      // Close list if we hit a non-list line
      if (inList) {
        output.push(listType === 'ul' ? '</ul>' : '</ol>');
        inList = false;
      }

      // Empty line = paragraph break
      if (line.trim() === '') {
        output.push('');
        continue;
      }

      // Regular paragraph
      output.push(`<p>${this.parseInline(line)}</p>`);
    }

    // Close any open blocks
    if (inList) output.push(listType === 'ul' ? '</ul>' : '</ol>');
    if (inBlockquote) output.push('</blockquote>');

    let result = output.join('\n');

    // Restore code blocks
    codeBlocks.forEach((block, index) => {
      result = result.replace(`%%CODEBLOCK_${index}%%`, block);
    });

    return result;
  }

  private parseInline(text: string): string {
    let result = text;

    // 12. Images ![alt](url) - must be before links
    result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%">');

    // 11. Links [text](url)
    result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // 13. Wiki links [[Page Name]]
    result = result.replace(/\[\[([^\]]+)\]\]/g, (_match, pageName: string) => {
      const exists = !!this.pages()[pageName];
      const cssClass = exists ? 'wiki-link' : 'wiki-link wiki-link-missing';
      return `<a href="#" data-wiki-link="${this.escapeHtml(pageName)}" class="${cssClass}">${this.escapeHtml(pageName)}</a>`;
    });

    // 8. Bold (**text** or __text__)
    result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    result = result.replace(/__(.+?)__/g, '<strong>$1</strong>');

    // 9. Italic (*text* or _text_)
    result = result.replace(/\*(.+?)\*/g, '<em>$1</em>');
    result = result.replace(/(?<!\w)_(.+?)_(?!\w)/g, '<em>$1</em>');

    // 10. Strikethrough (~~text~~)
    result = result.replace(/~~(.+?)~~/g, '<del>$1</del>');

    return result;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
