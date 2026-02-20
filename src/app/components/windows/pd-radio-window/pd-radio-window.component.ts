import {
  Component,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  signal,
  computed,
  input,
  OnDestroy,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FloatWindow } from '../float-window/float-window.component';
import { DraggableDirective } from '../../../directives/draggable.directive';
import { PixelIconComponent } from '../../shared/pixel-icon/pixel-icon.component';

interface Station {
  name: string;
  emoji: string;
  query: string;
}

interface ArchiveItem {
  identifier: string;
  title: string;
  creator: string;
}

interface Track {
  name: string;
  title: string;
  format: string;
  length: string;
}

const STATIONS: Station[] = [
  { name: 'Classical', emoji: '\uD83C\uDFBB', query: 'classical+music' },
  { name: 'Jazz', emoji: '\uD83C\uDFB7', query: 'jazz+music' },
  { name: 'Blues', emoji: '\uD83C\uDFB8', query: 'blues+music' },
  { name: 'Folk', emoji: '\uD83C\uDFB6', query: 'folk+music' },
  { name: 'World', emoji: '\uD83C\uDF0D', query: 'world+music' },
  { name: 'Ambient', emoji: '\uD83C\uDF0C', query: 'ambient+music' }
];

@Component({
  selector: 'app-pd-radio-window',
  imports: [CommonModule, DraggableDirective, PixelIconComponent],
  templateUrl: './pd-radio-window.component.html',
  styleUrls: ['./pd-radio-window.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PdRadioWindowComponent extends FloatWindow implements OnDestroy {
  override title = input<string>('PD Radio');

  private cdr = inject(ChangeDetectorRef);
  private audio = new Audio();

  readonly stations = STATIONS;

  // State signals
  currentStation = signal<Station | null>(null);
  items = signal<ArchiveItem[]>([]);
  tracks = signal<Track[]>([]);
  itemIndex = signal(0);
  trackIndex = signal(0);
  isPlaying = signal(false);
  currentTime = signal(0);
  duration = signal(0);
  volume = signal(0.7);
  isLoading = signal(false);
  nowPlayingTitle = signal('');
  nowPlayingArtist = signal('');

  // Derived state
  currentTimeFormatted = computed(() => this.formatTime(this.currentTime()));
  durationFormatted = computed(() => this.formatTime(this.duration()));
  progressPercent = computed(() => {
    const dur = this.duration();
    return dur > 0 ? (this.currentTime() / dur) * 100 : 0;
  });

  constructor() {
    super();
    this.width.set(800);
    this.height.set(600);

    this.audio.volume = this.volume();

    this.audio.addEventListener('timeupdate', () => {
      this.currentTime.set(this.audio.currentTime);
      this.duration.set(this.audio.duration || 0);
      this.cdr.markForCheck();
    });

    this.audio.addEventListener('ended', () => {
      this.advanceTrack();
      this.cdr.markForCheck();
    });

    this.audio.addEventListener('play', () => {
      this.isPlaying.set(true);
      this.cdr.markForCheck();
    });

    this.audio.addEventListener('pause', () => {
      this.isPlaying.set(false);
      this.cdr.markForCheck();
    });

    this.audio.addEventListener('loadedmetadata', () => {
      this.duration.set(this.audio.duration || 0);
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.audio.pause();
    this.audio.src = '';
    this.audio.removeAttribute('src');
  }

  selectStation(station: Station): void {
    this.currentStation.set(station);
    this.audio.pause();
    this.items.set([]);
    this.tracks.set([]);
    this.itemIndex.set(0);
    this.trackIndex.set(0);
    this.isPlaying.set(false);
    this.nowPlayingTitle.set('');
    this.nowPlayingArtist.set('');
    this.currentTime.set(0);
    this.duration.set(0);
    this.fetchItems(station.query);
  }

  togglePlayPause(): void {
    if (this.audio.src && this.audio.src !== '') {
      if (this.audio.paused) {
        this.audio.play();
      } else {
        this.audio.pause();
      }
    }
  }

  nextTrack(): void {
    this.advanceTrack();
  }

  prevTrack(): void {
    const tIdx = this.trackIndex();
    const tracks = this.tracks();

    if (tIdx > 0) {
      this.trackIndex.set(tIdx - 1);
      this.playCurrentTrack();
    } else {
      // Go to previous item
      const iIdx = this.itemIndex();
      const items = this.items();
      if (iIdx > 0) {
        this.itemIndex.set(iIdx - 1);
        this.trackIndex.set(0);
        this.fetchTracksAndPlay(items[iIdx - 1].identifier);
      }
    }
  }

  seekTo(event: MouseEvent): void {
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const percent = (event.clientX - rect.left) / rect.width;
    const dur = this.duration();
    if (dur > 0) {
      this.audio.currentTime = percent * dur;
    }
  }

  onVolumeChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const vol = parseFloat(target.value);
    this.volume.set(vol);
    this.audio.volume = vol;
  }

  selectTrack(index: number): void {
    this.trackIndex.set(index);
    this.playCurrentTrack();
  }

  private async fetchItems(query: string): Promise<void> {
    this.isLoading.set(true);
    this.cdr.markForCheck();

    try {
      const url = `https://archive.org/advancedsearch.php?q=mediatype:audio+AND+subject:${query}&fl=identifier,title,creator&rows=20&output=json`;
      const response = await fetch(url);
      const data = await response.json();
      const docs: ArchiveItem[] = data?.response?.docs ?? [];

      // Shuffle for variety
      const shuffled = this.shuffle([...docs]);
      this.items.set(shuffled);

      if (shuffled.length > 0) {
        this.itemIndex.set(0);
        await this.fetchTracksAndPlay(shuffled[0].identifier);
      }
    } catch {
      this.items.set([]);
    } finally {
      this.isLoading.set(false);
      this.cdr.markForCheck();
    }
  }

  private async fetchTracksAndPlay(identifier: string): Promise<void> {
    this.isLoading.set(true);
    this.cdr.markForCheck();

    try {
      const url = `https://archive.org/metadata/${identifier}`;
      const response = await fetch(url);
      const data = await response.json();

      const files: Track[] = (data?.files ?? [])
        .filter((f: { format: string; name: string }) =>
          f.format === 'VBR MP3' ||
          f.format === 'MP3' ||
          f.format === '128Kbps MP3' ||
          f.name?.endsWith('.mp3') ||
          f.name?.endsWith('.ogg')
        )
        .map((f: { name: string; title?: string; format: string; length?: string }) => ({
          name: f.name,
          title: f.title || f.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' '),
          format: f.format,
          length: f.length || ''
        }));

      this.tracks.set(files);

      // Update now playing artist from the item
      const currentItems = this.items();
      const iIdx = this.itemIndex();
      if (currentItems[iIdx]) {
        this.nowPlayingArtist.set(currentItems[iIdx].creator || 'Unknown Artist');
      }

      if (files.length > 0) {
        this.trackIndex.set(0);
        this.playCurrentTrack();
      } else {
        // No playable tracks, advance to next item
        this.advanceItem();
      }
    } catch {
      this.tracks.set([]);
      this.advanceItem();
    } finally {
      this.isLoading.set(false);
      this.cdr.markForCheck();
    }
  }

  private playCurrentTrack(): void {
    const tracks = this.tracks();
    const tIdx = this.trackIndex();
    const items = this.items();
    const iIdx = this.itemIndex();

    if (tracks.length === 0 || tIdx >= tracks.length) return;

    const track = tracks[tIdx];
    const item = items[iIdx];

    if (!item) return;

    const audioUrl = `https://archive.org/download/${item.identifier}/${encodeURIComponent(track.name)}`;

    this.audio.src = audioUrl;
    this.audio.play().catch(() => {
      // Autoplay may be blocked, user can click play
      this.isPlaying.set(false);
      this.cdr.markForCheck();
    });

    this.nowPlayingTitle.set(track.title);
    this.nowPlayingArtist.set(item.creator || 'Unknown Artist');
    this.cdr.markForCheck();
  }

  private advanceTrack(): void {
    const tIdx = this.trackIndex();
    const tracks = this.tracks();

    if (tIdx < tracks.length - 1) {
      this.trackIndex.set(tIdx + 1);
      this.playCurrentTrack();
    } else {
      this.advanceItem();
    }
  }

  private advanceItem(): void {
    const iIdx = this.itemIndex();
    const items = this.items();

    if (iIdx < items.length - 1) {
      this.itemIndex.set(iIdx + 1);
      this.trackIndex.set(0);
      this.fetchTracksAndPlay(items[iIdx + 1].identifier);
    } else {
      // Reached end, loop back or stop
      this.isPlaying.set(false);
      this.nowPlayingTitle.set('');
      this.nowPlayingArtist.set('');
      this.cdr.markForCheck();
    }
  }

  private shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  private formatTime(seconds: number): string {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}
