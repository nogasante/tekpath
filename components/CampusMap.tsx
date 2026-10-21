import { createElement, useEffect, useMemo } from 'react';
import { Platform, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { campus } from '@/lib/theme';
import type { AccessFeature } from '@/lib/types';

type Props = {
  features: AccessFeature[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  onCenter?: (latitude: number, longitude: number) => void;
};

function mapHtml(features: AccessFeature[], selectedId?: string | null) {
  const payload = JSON.stringify({ features, selectedId: selectedId ?? null, campus }).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { height: 100%; margin: 0; background: #d5e0d4; }
    .pin { border: 2px solid #102017; border-radius: 999px; color: white; font: 700 13px sans-serif;
      width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; }
    .pin.selected { outline: 3px solid #0B4F8A; }
    .leaflet-control-attribution { font-size: 11px; }
  </style>
</head>
<body>
  <div id="map" role="application" aria-label="KNUST campus map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const boot = ${payload};
    const colors = { working: '#0C5C3B', broken: '#8C2F1B', unknown: '#6E5206' };
    const letters = { ramp: 'R', lift: 'L', toilet: 'T', parking: 'P', entrance: 'E' };
    const post = (msg) => {
      const data = JSON.stringify(msg);
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(data);
      else window.parent.postMessage(data, '*');
    };
    if (!window.L) {
      post({ type: 'map-error' });
    } else {
      const map = L.map('map', { zoomControl: true }).setView([boot.campus.latitude, boot.campus.longitude], 16);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
      }).addTo(map);
      const layer = L.layerGroup().addTo(map);
      const draw = (features, selectedId) => {
        layer.clearLayers();
        features.forEach((feature) => {
          const color = colors[feature.status] || colors.unknown;
          const icon = L.divIcon({
            className: '',
            html: '<div class="pin' + (feature.id === selectedId ? ' selected' : '') + '" style="background:' + color + '" title="' + feature.name + '">' + (letters[feature.kind] || '?') + '</div>',
            iconSize: [28, 28],
            iconAnchor: [14, 14]
          });
          L.marker([feature.latitude, feature.longitude], { icon, title: feature.name + ', ' + feature.status })
            .addTo(layer)
            .on('click', () => post({ type: 'select', id: feature.id }));
        });
      };
      draw(boot.features, boot.selectedId);
      map.on('moveend', () => {
        const c = map.getCenter();
        post({ type: 'center', latitude: c.lat, longitude: c.lng });
      });
      window.renderTekpath = (next) => draw(next.features || [], next.selectedId);
    }
  </script>
</body>
</html>`;
}

export function CampusMap({ features, selectedId, onSelect, onCenter }: Props) {
  const signature = features.map((feature) => `${feature.id}:${feature.status}:${feature.latitude}`).join('|') + (selectedId ?? '');
  const html = useMemo(() => mapHtml(features, selectedId), [signature]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onMessage = (event: MessageEvent) => {
      const data = typeof event.data === 'string' ? parse(event.data) : null;
      if (!data) return;
      if (data.type === 'select' && typeof data.id === 'string') onSelect(data.id);
      if (data.type === 'center' && onCenter) onCenter(Number(data.latitude), Number(data.longitude));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onSelect, onCenter]);

  if (Platform.OS === 'web') {
    return (
      <View style={{ flex: 1, minHeight: 240, backgroundColor: '#d5e0d4' }}>
        {createElement('iframe', {
          title: 'KNUST campus map, OpenStreetMap',
          srcDoc: html,
          style: { border: 0, width: '100%', height: '100%', minHeight: 240 },
        })}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, minHeight: 240 }}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        onMessage={(event: { nativeEvent: { data: string } }) => {
          const data = parse(event.nativeEvent.data);
          if (!data) return;
          if (data.type === 'select' && typeof data.id === 'string') onSelect(data.id);
          if (data.type === 'center' && onCenter) onCenter(Number(data.latitude), Number(data.longitude));
        }}
        accessibilityLabel="KNUST campus map"
      />
    </View>
  );
}

function parse(value: string): { type?: string; id?: string; latitude?: number; longitude?: number } | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
