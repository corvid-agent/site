import {
  Component,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  signal,
  computed,
  input,
  inject,
  OnInit,
  OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FloatWindow } from '../float-window/float-window.component';
import { DraggableDirective } from '../../../directives/draggable.directive';
import { PixelIconComponent } from '../../shared/pixel-icon/pixel-icon.component';

interface CityTimezone {
  name: string;
  timezone: string;
}

interface ClockCardData {
  name: string;
  timezone: string;
  time: string;
  date: string;
  abbreviation: string;
  isDaytime: boolean;
  hour24: number;
}

interface ConverterResult {
  name: string;
  timezone: string;
  convertedTime: string;
  convertedDate: string;
  isDaytime: boolean;
}

type TabId = 'clocks' | 'converter';

const ALL_CITIES: CityTimezone[] = [
  { name: 'New York', timezone: 'America/New_York' },
  { name: 'Los Angeles', timezone: 'America/Los_Angeles' },
  { name: 'Chicago', timezone: 'America/Chicago' },
  { name: 'London', timezone: 'Europe/London' },
  { name: 'Paris', timezone: 'Europe/Paris' },
  { name: 'Berlin', timezone: 'Europe/Berlin' },
  { name: 'Moscow', timezone: 'Europe/Moscow' },
  { name: 'Dubai', timezone: 'Asia/Dubai' },
  { name: 'Mumbai', timezone: 'Asia/Kolkata' },
  { name: 'Bangkok', timezone: 'Asia/Bangkok' },
  { name: 'Singapore', timezone: 'Asia/Singapore' },
  { name: 'Tokyo', timezone: 'Asia/Tokyo' },
  { name: 'Seoul', timezone: 'Asia/Seoul' },
  { name: 'Sydney', timezone: 'Australia/Sydney' },
  { name: 'Auckland', timezone: 'Pacific/Auckland' },
  { name: 'Honolulu', timezone: 'Pacific/Honolulu' },
  { name: 'Sao Paulo', timezone: 'America/Sao_Paulo' },
  { name: 'Cairo', timezone: 'Africa/Cairo' },
  { name: 'Lagos', timezone: 'Africa/Lagos' },
  { name: 'Istanbul', timezone: 'Europe/Istanbul' }
];

const LOCAL_CITY: CityTimezone = { name: 'Local', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };

const DEFAULT_CITY_NAMES = ['Local', 'New York', 'London', 'Tokyo', 'Sydney', 'Dubai'];
const STORAGE_KEY = 'world-clock-active-cities';

@Component({
  selector: 'app-world-clock-window',
  imports: [CommonModule, FormsModule, DraggableDirective, PixelIconComponent],
  templateUrl: 'world-clock-window.component.html',
  styleUrls: ['world-clock-window.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorldClockWindowComponent extends FloatWindow implements OnInit, OnDestroy {
  override title = input<string>('World Clock');

  private cdr = inject(ChangeDetectorRef);
  private intervalId: ReturnType<typeof setInterval> | null = null;

  // All available cities (including Local)
  readonly allCities: CityTimezone[] = [LOCAL_CITY, ...ALL_CITIES];

  // State signals
  activeCityNames = signal<string[]>(this.loadActiveCities());
  activeTab = signal<TabId>('clocks');
  currentTime = signal<Date>(new Date());
  converterSourceTz = signal<string>(LOCAL_CITY.timezone);
  converterTime = signal<string>(this.getCurrentTimeString());
  showCityPicker = signal(false);

  // Computed: full city objects for active cities
  activeCities = computed(() => {
    const names = this.activeCityNames();
    return names
      .map(name => this.allCities.find(c => c.name === name))
      .filter((c): c is CityTimezone => c !== undefined);
  });

  // Computed: inactive cities available for adding
  inactiveCities = computed(() => {
    const activeNames = new Set(this.activeCityNames());
    return this.allCities.filter(c => !activeNames.has(c.name));
  });

  // Computed: clock card data for each active city
  clockData = computed<ClockCardData[]>(() => {
    const now = this.currentTime();
    return this.activeCities().map(city => this.buildClockCard(city, now));
  });

  // Computed: converter results for all active cities
  converterResults = computed<ConverterResult[]>(() => {
    const sourceTz = this.converterSourceTz();
    const timeStr = this.converterTime();
    // Depend on currentTime so the date context updates
    const now = this.currentTime();

    if (!timeStr) return [];

    const [hours, minutes] = timeStr.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) return [];

    // Build a Date in the source timezone's local date
    const sourceDate = new Date(now);
    // Get the current date in the source timezone
    const sourceDateParts = new Intl.DateTimeFormat('en-US', {
      timeZone: sourceTz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(now);

    const year = Number(sourceDateParts.find(p => p.type === 'year')?.value);
    const month = Number(sourceDateParts.find(p => p.type === 'month')?.value) - 1;
    const day = Number(sourceDateParts.find(p => p.type === 'day')?.value);

    // Create a reference date in UTC that corresponds to the desired source time
    // by calculating the offset
    const refDate = new Date(Date.UTC(year, month, day, hours, minutes, 0));
    const sourceOffset = this.getTimezoneOffsetMinutes(sourceTz, refDate);
    const utcTime = new Date(refDate.getTime() + sourceOffset * 60 * 1000);

    return this.activeCities().map(city => {
      const targetOffset = this.getTimezoneOffsetMinutes(city.timezone, utcTime);
      const targetTime = new Date(utcTime.getTime() - targetOffset * 60 * 1000);

      const timeFmt = new Intl.DateTimeFormat('en-US', {
        timeZone: city.timezone,
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });

      const dateFmt = new Intl.DateTimeFormat('en-US', {
        timeZone: city.timezone,
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });

      const hourParts = new Intl.DateTimeFormat('en-US', {
        timeZone: city.timezone,
        hour: 'numeric',
        hour12: false
      }).formatToParts(utcTime);
      const hour24 = Number(hourParts.find(p => p.type === 'hour')?.value ?? 0);

      return {
        name: city.name,
        timezone: city.timezone,
        convertedTime: timeFmt.format(utcTime),
        convertedDate: dateFmt.format(utcTime),
        isDaytime: hour24 >= 6 && hour24 < 18
      };
    });
  });

  constructor() {
    super();
    this.width.set(900);
    this.height.set(650);
  }

  ngOnInit(): void {
    this.intervalId = setInterval(() => {
      this.currentTime.set(new Date());
      this.cdr.markForCheck();
    }, 1000);
  }

  ngOnDestroy(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  setTab(tab: TabId): void {
    this.activeTab.set(tab);
  }

  addCity(cityName: string): void {
    this.activeCityNames.update(names => {
      if (names.includes(cityName)) return names;
      const updated = [...names, cityName];
      this.saveActiveCities(updated);
      return updated;
    });
    this.showCityPicker.set(false);
  }

  removeCity(cityName: string): void {
    this.activeCityNames.update(names => {
      const updated = names.filter(n => n !== cityName);
      this.saveActiveCities(updated);
      return updated;
    });
  }

  toggleCityPicker(): void {
    this.showCityPicker.update(v => !v);
  }

  onConverterSourceChange(value: string): void {
    this.converterSourceTz.set(value);
  }

  onConverterTimeChange(value: string): void {
    this.converterTime.set(value);
  }

  setConverterToNow(): void {
    this.converterTime.set(this.getCurrentTimeString());
  }

  private buildClockCard(city: CityTimezone, now: Date): ClockCardData {
    const timeFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: city.timezone,
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });

    const dateFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: city.timezone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

    const tzAbbr = new Intl.DateTimeFormat('en-US', {
      timeZone: city.timezone,
      timeZoneName: 'short'
    }).formatToParts(now).find(p => p.type === 'timeZoneName')?.value ?? '';

    const hourParts = new Intl.DateTimeFormat('en-US', {
      timeZone: city.timezone,
      hour: 'numeric',
      hour12: false
    }).formatToParts(now);
    const hour24 = Number(hourParts.find(p => p.type === 'hour')?.value ?? 0);

    return {
      name: city.name,
      timezone: city.timezone,
      time: timeFmt.format(now),
      date: dateFmt.format(now),
      abbreviation: tzAbbr,
      isDaytime: hour24 >= 6 && hour24 < 18,
      hour24
    };
  }

  private getTimezoneOffsetMinutes(timezone: string, date: Date): number {
    const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' });
    const tzStr = date.toLocaleString('en-US', { timeZone: timezone });
    const utcDate = new Date(utcStr);
    const tzDate = new Date(tzStr);
    return (utcDate.getTime() - tzDate.getTime()) / (60 * 1000);
  }

  private getCurrentTimeString(): string {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  private loadActiveCities(): string[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as string[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // Ignore parse errors
    }
    return [...DEFAULT_CITY_NAMES];
  }

  private saveActiveCities(names: string[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(names));
    } catch {
      // Ignore storage errors
    }
  }
}
