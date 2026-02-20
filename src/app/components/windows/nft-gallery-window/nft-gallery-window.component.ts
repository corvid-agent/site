import {
  Component,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  signal,
  computed,
  input,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FloatWindow } from '../float-window/float-window.component';
import { DraggableDirective } from '../../../directives/draggable.directive';
import { PixelIconComponent } from '../../shared/pixel-icon/pixel-icon.component';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

interface FeaturedCollection {
  name: string;
  address: string;
  emoji: string;
}

interface NftAsset {
  index: number;
  name: string;
  unitName: string;
  url: string;
  reserve: string;
  imageUrl: string;
}

interface Arc69Metadata {
  standard?: string;
  description?: string;
  image?: string;
  image_mimetype?: string;
  properties?: Record<string, unknown>;
  [key: string]: unknown;
}

interface AssetDetail {
  index: number;
  params: {
    name: string;
    'unit-name': string;
    url: string;
    total: number;
    decimals: number;
    creator: string;
    reserve: string;
    [key: string]: unknown;
  };
}

interface ModalData {
  asset: NftAsset;
  detail: AssetDetail | null;
  arc69: Arc69Metadata | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INDEXER = 'https://mainnet-idx.4160.nodely.dev';

const FEATURED_COLLECTIONS: FeaturedCollection[] = [
  { name: 'Alchemon', address: 'OJGTHEJ2O5NXN7FVXDZZEEJTUEQHHCIYQAOC3BFBJWZJHIOEVPF6MVNCE', emoji: '\uD83D\uDC09' },
  { name: 'Al Goanna', address: 'ALGONAUUFHPM5XBTSALSAUSJMNMM356FDIRETMJM5BPEYZGVUJHDBIUVHY', emoji: '\uD83E\uDD8E' },
  { name: 'Thurstober', address: 'THURSTOBER54KFBKBGCXII6677MZG4XUQM4MXRAKGFK76Q2B2KAE6SIOGI', emoji: '\uD83C\uDFA8' },
  { name: 'Headline Punks', address: 'HDL6Z2RB7OKYQRGGSO3HCB6D3SNDLABFKDNFD75YNYSAMQFML6HLWRYJMI', emoji: '\uD83D\uDC7E' },
  { name: 'Shitty Kitties', address: 'SKITEOKT5JZPVERY72Y3PSAVPN5KAEGEPTPBCA5KULNUAADJ2YIQU7U4PU', emoji: '\uD83D\uDC31' },
  { name: 'Yieldlings', address: 'YLDLYQSTAVH5XX7LNBRPDIVDUNKBRLPHUQQGKQ2NVTSA445SBTGUKT6GBI', emoji: '\uD83C\uDF31' },
  { name: 'Algo Socks', address: 'SOCKSRLHCV6CTWGD6IMEDCB4WKHXE6PUXSKG5UCUMDOE2AGGSMBTPAAWQJI', emoji: '\uD83E\uDDE6' },
  { name: 'Crescendo', address: 'C3NJUECAK3XXBHBFMO5HBFJDKBR7Y3LQV2DJRCAB7BSNKQ6QLDA3GQMXLE', emoji: '\uD83C\uDFB5' }
];

const FAVORITES_KEY = 'nft-gallery-favorites';

// ---------------------------------------------------------------------------
// Base32 / CID / ARC-19 Utilities
// ---------------------------------------------------------------------------

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(input: string): Uint8Array {
  const cleaned = input.toUpperCase().replace(/=+$/, '');
  const output: number[] = [];
  let bits = 0;
  let value = 0;

  for (const char of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      output.push((value >>> bits) & 0xff);
    }
  }
  return new Uint8Array(output);
}

function base32Encode(data: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let result = '';

  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += BASE32_ALPHABET[(value >>> bits) & 0x1f];
    }
  }

  if (bits > 0) {
    result += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }

  return result.toLowerCase();
}

function encodeVarint(value: number): number[] {
  const bytes: number[] = [];
  while (value > 0x7f) {
    bytes.push((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  bytes.push(value & 0x7f);
  return bytes;
}

function encodeCidV1(codecCode: number, hashBytes: Uint8Array): string {
  // CIDv1: version(1) + codec + multihash(0x12 = sha2-256, length, digest)
  const version = 0x01;
  const cidBytes = [
    ...encodeVarint(version),
    ...encodeVarint(codecCode),
    0x12, // sha2-256
    hashBytes.length,
    ...hashBytes
  ];
  return base32Encode(new Uint8Array(cidBytes));
}

function decodeAlgorandAddress(address: string): Uint8Array {
  const decoded = base32Decode(address);
  // Algorand address = 32-byte public key + 4-byte checksum
  return decoded.slice(0, 32);
}

function resolveArc19WithReserve(templateUrl: string, reserveAddress: string): string {
  if (!templateUrl || !reserveAddress) return '';

  // Extract template parts
  const match = templateUrl.match(/template-ipfs:\/\/\{ipfscid:(\d+):([a-z0-9-]+):([a-z0-9-]+):(\d+)\}/i);
  if (!match) return '';

  const version = parseInt(match[1], 10);
  const codecName = match[2];
  const _hashType = match[3];
  const _hashLength = parseInt(match[4], 10);

  // Codec lookup
  const codecMap: Record<string, number> = {
    'dag-pb': 0x70,
    'raw': 0x55
  };
  const codecCode = codecMap[codecName] ?? 0x55;

  const hashBytes = decodeAlgorandAddress(reserveAddress);

  if (version === 0) {
    // CIDv0 is base58btc of multihash — but typically we convert to v1
    const cidStr = encodeCidV1(codecCode, hashBytes);
    return `https://ipfs.io/ipfs/b${cidStr}`;
  } else {
    // CIDv1
    const cidStr = encodeCidV1(codecCode, hashBytes);
    return `https://ipfs.io/ipfs/b${cidStr}`;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

@Component({
  selector: 'app-nft-gallery-window',
  imports: [CommonModule, DraggableDirective, PixelIconComponent],
  templateUrl: './nft-gallery-window.component.html',
  styleUrls: ['./nft-gallery-window.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NftGalleryWindowComponent extends FloatWindow {
  override title = input<string>('NFT Gallery');

  private cdr = inject(ChangeDetectorRef);

  readonly collections = FEATURED_COLLECTIONS;

  // State signals
  activeTab = signal<'browse' | 'favorites'>('browse');
  searchQuery = signal('');
  assets = signal<NftAsset[]>([]);
  nextToken = signal<string | null>(null);
  isLoading = signal(false);
  favorites = signal<Record<number, boolean>>({});
  modalAsset = signal<NftAsset | null>(null);
  modalArc69 = signal<Arc69Metadata | null>(null);
  modalDetail = signal<AssetDetail | null>(null);
  cache = signal<Record<string, NftAsset[]>>({});
  currentAddress = signal('');

  // Derived state
  favoriteAssetIds = computed(() => {
    const favs = this.favorites();
    return Object.keys(favs).filter(id => favs[Number(id)]).map(Number);
  });

  filteredAssets = computed(() => {
    if (this.activeTab() === 'favorites') {
      const favs = this.favorites();
      return this.assets().filter(a => favs[a.index]);
    }
    return this.assets();
  });

  hasFavorites = computed(() => this.favoriteAssetIds().length > 0);

  constructor() {
    super();
    this.width.set(1000);
    this.height.set(700);
    this.loadFavorites();
  }

  // ---------------------------------------------------------------------------
  // Tab navigation
  // ---------------------------------------------------------------------------

  switchTab(tab: 'browse' | 'favorites'): void {
    this.activeTab.set(tab);
    if (tab === 'favorites') {
      this.loadFavoriteAssets();
    }
  }

  // ---------------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------------

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value.trim();
    this.searchQuery.set(value);
  }

  onSearchSubmit(): void {
    const query = this.searchQuery();
    if (!query) return;

    // Determine if query is an asset ID (number) or address
    if (/^\d+$/.test(query)) {
      this.loadSingleAsset(parseInt(query, 10));
    } else if (query.length === 58) {
      this.loadCollectionByAddress(query);
    }
  }

  onSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.onSearchSubmit();
    }
  }

  // ---------------------------------------------------------------------------
  // Collection loading
  // ---------------------------------------------------------------------------

  selectCollection(collection: FeaturedCollection): void {
    this.searchQuery.set(collection.address);
    this.loadCollectionByAddress(collection.address);
  }

  async loadCollectionByAddress(address: string): Promise<void> {
    this.activeTab.set('browse');
    this.currentAddress.set(address);
    this.assets.set([]);
    this.nextToken.set(null);
    this.isLoading.set(true);
    this.cdr.markForCheck();

    try {
      const url = `${INDEXER}/v2/accounts/${address}/created-assets?limit=20`;
      const response = await fetch(url);
      const data = await response.json();
      const rawAssets = data?.assets ?? [];
      const token = data?.['next-token'] ?? null;

      const nfts = await this.mapRawAssets(rawAssets);
      this.assets.set(nfts);
      this.nextToken.set(token);
    } catch (err) {
      console.error('Error loading collection:', err);
      this.assets.set([]);
    } finally {
      this.isLoading.set(false);
      this.cdr.markForCheck();
    }
  }

  async loadMore(): Promise<void> {
    const token = this.nextToken();
    const address = this.currentAddress();
    if (!token || !address || this.isLoading()) return;

    this.isLoading.set(true);
    this.cdr.markForCheck();

    try {
      const url = `${INDEXER}/v2/accounts/${address}/created-assets?limit=20&next=${token}`;
      const response = await fetch(url);
      const data = await response.json();
      const rawAssets = data?.assets ?? [];
      const newToken = data?.['next-token'] ?? null;

      const nfts = await this.mapRawAssets(rawAssets);
      this.assets.update(current => [...current, ...nfts]);
      this.nextToken.set(newToken);
    } catch (err) {
      console.error('Error loading more:', err);
    } finally {
      this.isLoading.set(false);
      this.cdr.markForCheck();
    }
  }

  // ---------------------------------------------------------------------------
  // Single asset lookup
  // ---------------------------------------------------------------------------

  private async loadSingleAsset(assetId: number): Promise<void> {
    this.activeTab.set('browse');
    this.assets.set([]);
    this.nextToken.set(null);
    this.currentAddress.set('');
    this.isLoading.set(true);
    this.cdr.markForCheck();

    try {
      const detail = await this.fetchAssetDetail(assetId);
      if (detail) {
        const imageUrl = await this.resolveImageUrl(
          detail.params.url,
          detail.params.reserve,
          assetId
        );
        const nft: NftAsset = {
          index: detail.index,
          name: detail.params.name ?? `Asset #${detail.index}`,
          unitName: detail.params['unit-name'] ?? '',
          url: detail.params.url ?? '',
          reserve: detail.params.reserve ?? '',
          imageUrl
        };
        this.assets.set([nft]);
      }
    } catch (err) {
      console.error('Error loading asset:', err);
    } finally {
      this.isLoading.set(false);
      this.cdr.markForCheck();
    }
  }

  // ---------------------------------------------------------------------------
  // Favorites
  // ---------------------------------------------------------------------------

  isFavorite(assetId: number): boolean {
    return !!this.favorites()[assetId];
  }

  toggleFavorite(event: Event, asset: NftAsset): void {
    event.stopPropagation();
    this.favorites.update(favs => {
      const updated = { ...favs };
      if (updated[asset.index]) {
        delete updated[asset.index];
      } else {
        updated[asset.index] = true;
      }
      return updated;
    });
    this.saveFavorites();
    this.cdr.markForCheck();
  }

  private loadFavorites(): void {
    try {
      const stored = localStorage.getItem(FAVORITES_KEY);
      if (stored) {
        this.favorites.set(JSON.parse(stored));
      }
    } catch {
      this.favorites.set({});
    }
  }

  private saveFavorites(): void {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(this.favorites()));
    } catch {
      // localStorage may be full or unavailable
    }
  }

  private async loadFavoriteAssets(): Promise<void> {
    const ids = this.favoriteAssetIds();
    if (ids.length === 0) {
      this.assets.set([]);
      this.cdr.markForCheck();
      return;
    }

    this.isLoading.set(true);
    this.cdr.markForCheck();

    try {
      const results: NftAsset[] = [];
      for (const id of ids) {
        try {
          const detail = await this.fetchAssetDetail(id);
          if (detail) {
            const imageUrl = await this.resolveImageUrl(
              detail.params.url,
              detail.params.reserve,
              id
            );
            results.push({
              index: detail.index,
              name: detail.params.name ?? `Asset #${detail.index}`,
              unitName: detail.params['unit-name'] ?? '',
              url: detail.params.url ?? '',
              reserve: detail.params.reserve ?? '',
              imageUrl
            });
          }
        } catch {
          // Skip failed asset loads
        }
      }
      this.assets.set(results);
    } catch (err) {
      console.error('Error loading favorites:', err);
    } finally {
      this.isLoading.set(false);
      this.cdr.markForCheck();
    }
  }

  // ---------------------------------------------------------------------------
  // Detail Modal
  // ---------------------------------------------------------------------------

  async openModal(asset: NftAsset): Promise<void> {
    this.modalAsset.set(asset);
    this.modalArc69.set(null);
    this.modalDetail.set(null);
    this.cdr.markForCheck();

    try {
      const [detail, arc69] = await Promise.all([
        this.fetchAssetDetail(asset.index),
        this.fetchArc69Metadata(asset.index)
      ]);
      this.modalDetail.set(detail);
      this.modalArc69.set(arc69);
    } catch {
      // Modal still shows with basic info
    }
    this.cdr.markForCheck();
  }

  closeModal(): void {
    this.modalAsset.set(null);
    this.modalArc69.set(null);
    this.modalDetail.set(null);
    this.cdr.markForCheck();
  }

  getTraits(arc69: Arc69Metadata | null): { key: string; value: string }[] {
    if (!arc69?.properties) return [];
    return Object.entries(arc69.properties)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([key, value]) => ({ key, value: String(value) }));
  }

  // ---------------------------------------------------------------------------
  // API calls
  // ---------------------------------------------------------------------------

  private async fetchAssetDetail(assetId: number): Promise<AssetDetail | null> {
    try {
      const url = `${INDEXER}/v2/assets/${assetId}`;
      const response = await fetch(url);
      const data = await response.json();
      return data?.asset ?? null;
    } catch {
      return null;
    }
  }

  private async fetchArc69Metadata(assetId: number): Promise<Arc69Metadata | null> {
    try {
      const url = `${INDEXER}/v2/assets/${assetId}/transactions?tx-type=acfg&limit=1`;
      const response = await fetch(url);
      const data = await response.json();
      const txns = data?.transactions ?? [];
      if (txns.length === 0) return null;

      const note = txns[0]?.note;
      if (!note) return null;

      const decoded = atob(note);
      return JSON.parse(decoded);
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Image URL resolution
  // ---------------------------------------------------------------------------

  private async resolveImageUrl(
    url: string,
    reserve: string,
    assetId: number
  ): Promise<string> {
    // Priority 1: ARC-19 template URL with reserve address
    if (url && url.startsWith('template-ipfs://') && reserve) {
      const resolved = resolveArc19WithReserve(url, reserve);
      if (resolved) return resolved;
    }

    // Priority 2: ARC-69 metadata image
    try {
      const arc69 = await this.fetchArc69Metadata(assetId);
      if (arc69?.image) {
        return this.normalizeIpfsUrl(arc69.image);
      }
    } catch {
      // Fall through
    }

    // Priority 3: Standard URL field
    if (url) {
      return this.normalizeIpfsUrl(url);
    }

    return '';
  }

  private normalizeIpfsUrl(url: string): string {
    if (!url) return '';
    if (url.startsWith('ipfs://')) {
      const cid = url.replace('ipfs://', '');
      return `https://ipfs.io/ipfs/${cid}`;
    }
    if (url.startsWith('template-ipfs://')) {
      // Cannot resolve without reserve — return empty
      return '';
    }
    return url;
  }

  // ---------------------------------------------------------------------------
  // Raw asset mapping
  // ---------------------------------------------------------------------------

  private async mapRawAssets(rawAssets: { index: number; params: Record<string, unknown> }[]): Promise<NftAsset[]> {
    const results: NftAsset[] = [];

    for (const raw of rawAssets) {
      const params = raw.params ?? {};
      const url = (params['url'] as string) ?? '';
      const reserve = (params['reserve'] as string) ?? '';
      const name = (params['name'] as string) ?? `Asset #${raw.index}`;
      const unitName = (params['unit-name'] as string) ?? '';

      const imageUrl = await this.resolveImageUrl(url, reserve, raw.index);

      results.push({
        index: raw.index,
        name,
        unitName,
        url,
        reserve,
        imageUrl
      });
    }

    return results;
  }
}
