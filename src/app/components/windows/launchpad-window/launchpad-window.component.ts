import { Component, input, signal, output, ChangeDetectionStrategy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PixelIconComponent } from '../../shared/pixel-icon/pixel-icon.component';
import { WindowTypes } from '../../../enums/window-types.enum';
import { environment } from '../../../../environments/environment';

interface AppIcon {
  type: WindowTypes;
  icon: string;
  imgIcon?: string;
  label: string;
  color?: string;
  url?: string;
}

@Component({
  selector: 'app-launchpad-window',
  imports: [CommonModule, PixelIconComponent],
  templateUrl: 'launchpad-window.component.html',
  styleUrls: ['launchpad-window.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LaunchpadWindowComponent {
  // Inputs/Outputs
  title = input<string>('Launch Pad');
  closeEvent = output<WindowTypes | void>();

  // State
  isOpen = signal<boolean>(false);

  apps: AppIcon[] = [
    {
      type: WindowTypes.GALLERY,
      icon: 'photo',
      label: 'Gallery',
      color: '#FF6B6B'
    },
    {
      type: WindowTypes.NOTEPAD,
      icon: 'description',
      label: 'Notepad',
      color: '#4ECDC4'
    },
    {
      type: WindowTypes.TETRIS,
      icon: 'videogame_asset',
      label: 'Tetris',
      color: '#95E1D3'
    },
    {
      type: WindowTypes.ABOUT,
      icon: 'info',
      label: 'About',
      color: '#FFD93D'
    },
    {
      type: WindowTypes.BREAKOUT,
      icon: 'sports_esports',
      label: 'Breakout',
      color: '#6A4C93'
    },
    {
      type: WindowTypes.ROADMAP,
      icon: 'map',
      label: 'Roadmap',
      color: '#FF8C00'
    },
    {
      type: WindowTypes.MONO,
      icon: 'grid', // DO AN SVG FOR MONO LATER
      imgIcon: 'icons/mono-icon.png',
      label: 'Mono',
      color: '#000000'
    },

    // Conditionally add Style Guide in development mode
    ...(environment.production ? [] : [{
      type: WindowTypes.STYLE_GUIDE,
      icon: 'colors-swatch',
      label: 'Styles',
      color: '#FFB6C1'
    }])
  ];

  webApps: AppIcon[] = [
    { type: WindowTypes.ABOUT, icon: 'cloud-sun', label: 'Weather', color: '#38bdf8', url: 'https://corvid-agent.github.io/weather-dashboard/' },
    { type: WindowTypes.ABOUT, icon: 'movie', label: 'Cinema', color: '#94a3b8', url: 'https://corvid-agent.github.io/bw-cinema/' },
    { type: WindowTypes.ABOUT, icon: 'speed-fast', label: 'Space', color: '#a78bfa', url: 'https://corvid-agent.github.io/space-dashboard/' },
    { type: WindowTypes.ABOUT, icon: 'image-gallery', label: 'Gallery', color: '#fb923c', url: 'https://corvid-agent.github.io/pd-gallery/' },
    { type: WindowTypes.ABOUT, icon: 'headphone', label: 'Audiobooks', color: '#34d399', url: 'https://corvid-agent.github.io/pd-audiobooks/' },
    { type: WindowTypes.ABOUT, icon: 'script-text', label: 'Poetry', color: '#fbbf24', url: 'https://corvid-agent.github.io/poetry-atlas/' },
    { type: WindowTypes.ABOUT, icon: 'gps', label: 'Quake', color: '#f87171', url: 'https://corvid-agent.github.io/quake-tracker/' },
    { type: WindowTypes.ABOUT, icon: 'music', label: 'Music', color: '#e879f9', url: 'https://corvid-agent.github.io/pd-music/' },
    { type: WindowTypes.ABOUT, icon: 'edit', label: 'Pixel Forge', color: '#22d3ee', url: 'https://corvid-agent.github.io/pixel-forge/' },
    { type: WindowTypes.ABOUT, icon: 'gamepad', label: 'Arcade', color: '#a3e635', url: 'https://corvid-agent.github.io/retro-arcade/' },
    { type: WindowTypes.ABOUT, icon: 'radio-signal', label: 'Morse', color: '#fcd34d', url: 'https://corvid-agent.github.io/morse-code/' },
    { type: WindowTypes.ABOUT, icon: 'keyboard', label: 'Typing', color: '#a78bfa', url: 'https://corvid-agent.github.io/typing-test/' },
    { type: WindowTypes.ABOUT, icon: 'clock', label: 'Clocks', color: '#38bdf8', url: 'https://corvid-agent.github.io/world-clock/' },
    { type: WindowTypes.ABOUT, icon: 'code', label: 'Code', color: '#f97316', url: 'https://corvid-agent.github.io/code-playground/' },
    { type: WindowTypes.ABOUT, icon: 'radio-on', label: 'Radio', color: '#ec4899', url: 'https://corvid-agent.github.io/pd-radio/' },
    { type: WindowTypes.ABOUT, icon: 'note-multiple', label: 'Wiki', color: '#14b8a6', url: 'https://corvid-agent.github.io/markdown-wiki/' },
    { type: WindowTypes.ABOUT, icon: 'image-frame', label: 'NFTs', color: '#c084fc', url: 'https://corvid-agent.github.io/nft-gallery/' },
  ];

  infraApps: AppIcon[] = [
    { type: WindowTypes.ABOUT, icon: 'chart', label: 'Dashboard', color: '#818cf8', url: 'https://corvid-agent.github.io/agent-dashboard/' },
    { type: WindowTypes.ABOUT, icon: 'avatar', label: 'Profile', color: '#2dd4bf', url: 'https://corvid-agent.github.io/agent-profile/' },
    { type: WindowTypes.ABOUT, icon: 'search', label: 'Explorer', color: '#60a5fa', url: 'https://corvid-agent.github.io/algo-explorer/' },
    { type: WindowTypes.ABOUT, icon: 'chat', label: 'Chat', color: '#4ade80', url: 'https://corvid-agent.github.io/corvid-agent-chat/' },
  ];

  // Handle Escape key to close drawer
  @HostListener('document:keydown.escape')
  onEscapeKey() {
    if (this.isOpen()) {
      this.close();
    }
  }

  onAppClick(app: AppIcon) {
    if (app.url) {
      window.open(app.url, '_blank');
    } else {
      this.closeEvent.emit(app.type);
    }
  }

  close() {
    this.closeEvent.emit();
  }
}
