import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  ViewEncapsulation,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import * as L from 'leaflet';
import { GeoArea, Photo } from '../../core/api/models';
import { APP_SETTINGS } from '../../core/settings';

/**
 * Carte interactive (Leaflet) : photos géolocalisées et zone indiquée par le défi (US-031).
 * La planche contact reste l'alternative accessible au clavier ; la carte la complète.
 */
@Component({
  selector: 'psh-photo-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="psh-map-canvas" #canvas role="region" aria-label="Carte des photographies géolocalisées"></div>
    <button type="button" class="button secondary psh-map-search" (click)="emitBounds()">Chercher dans cette zone</button>
  `,
  styles: `
    psh-photo-map {
      position: relative;
      display: block;
    }

    .psh-map-canvas {
      height: 100%;
      min-height: 24rem;
      border-radius: var(--radius-frame);
      background: var(--rule);
    }

    .psh-map-search {
      position: absolute;
      top: var(--space-3);
      right: var(--space-3);
      z-index: 500;
      background: var(--paper);
      min-height: 2.25rem;
    }

    .psh-marker {
      stroke: var(--paper);
      stroke-width: 2;
      fill: var(--cyanotype);
      fill-opacity: 0.9;
    }

    .psh-marker.chosen {
      stroke: var(--grease);
      stroke-width: 4;
      fill: var(--paper);
    }

    .psh-zone {
      stroke: var(--film);
      stroke-dasharray: 6 6;
      fill: var(--cyanotype);
      fill-opacity: 0.06;
    }
  `,
})
export class PhotoMap {
  readonly photos = input<readonly Photo[]>([]);
  readonly area = input<GeoArea | null>(null);
  readonly selectedId = input<string | null>(null);
  readonly choose = output<Photo>();
  /** Rectangle visible « minLon,minLat,maxLon,maxLat » pour relancer une recherche sur la vue. */
  readonly searchBounds = output<string>();

  private readonly canvas = viewChild.required<ElementRef<HTMLDivElement>>('canvas');
  private readonly settings = inject(APP_SETTINGS);
  private readonly markers = L.layerGroup();
  private map: L.Map | null = null;
  private zone: L.Layer | null = null;

  constructor() {
    afterNextRender(() => {
      const map = L.map(this.canvas().nativeElement, { center: [46.6, 2.4], zoom: 5, scrollWheelZoom: false });
      L.tileLayer(this.settings.map.tileUrl, { attribution: this.settings.map.attribution, maxZoom: 18 }).addTo(map);
      this.markers.addTo(map);
      this.map = map;
      this.drawZone(this.area());
      this.drawPhotos(this.photos(), this.selectedId());
    });
    effect(() => this.drawPhotos(this.photos(), this.selectedId()));
    effect(() => this.drawZone(this.area()));
    inject(DestroyRef).onDestroy(() => this.map?.remove());
  }

  protected emitBounds(): void {
    if (!this.map) {
      return;
    }
    const bounds = this.map.getBounds();
    const values = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].map((value) =>
      Math.max(-180, Math.min(180, value)).toFixed(4),
    );
    this.searchBounds.emit(values.join(','));
  }

  private drawPhotos(photos: readonly Photo[], selectedId: string | null): void {
    if (!this.map) {
      return;
    }
    this.markers.clearLayers();
    for (const photo of photos) {
      if (!photo.location) {
        continue;
      }
      const chosen = photo.id === selectedId;
      L.circleMarker([photo.location.lat, photo.location.lon], {
        radius: chosen ? 11 : 7,
        className: chosen ? 'psh-marker chosen' : 'psh-marker',
      })
        .bindTooltip(photo.title)
        .on('click', () => this.choose.emit(photo))
        .addTo(this.markers);
    }
  }

  private drawZone(area: GeoArea | null): void {
    if (!this.map) {
      return;
    }
    if (this.zone) {
      this.zone.remove();
      this.zone = null;
    }
    if (!area) {
      return;
    }
    const layer =
      area.kind === 'BOX'
        ? L.rectangle(
            [
              [area.minLat, area.minLon],
              [area.maxLat, area.maxLon],
            ],
            { className: 'psh-zone', weight: 2 },
          )
        : L.circle([area.lat, area.lon], { radius: area.radiusKm * 1000, className: 'psh-zone', weight: 2 });
    layer.addTo(this.map);
    this.map.fitBounds(layer.getBounds(), { padding: [24, 24] });
    this.zone = layer;
  }
}
