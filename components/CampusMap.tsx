import { createElement, forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, type RefObject } from 'react';
import { Platform, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { IconButton } from '@/components/ui';
import { useTheme } from '@/context/Theme';
import { glyph } from '@/components/glyphs';
import { campus } from '@/lib/theme';
import type { AccessFeature } from '@/lib/types';

export type MapPadding = { top: number; right: number; bottom: number; left: number };

export type MapHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
  recenter: () => void;
  toggleLayer: () => void;
};

type Props = {
  features: AccessFeature[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  onCenter?: (latitude: number, longitude: number) => void;
  padding?: MapPadding;
};

type Bridge = {
  update: (msg: unknown) => void;
  zoomBy: (delta: number) => void;
  recenter: () => void;
  toggleLayer: () => void;
};

const MAP_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { height: 100%; margin: 0; background: #E4EFE8; }
    .leaflet-control-zoom { display: none !important; }
    .leaflet-div-icon { background: transparent; border: 0; }
    .leaflet-control-attribution {
      font: 11px/1.3 sans-serif;
      background: rgba(255,252,248,.88);
      color: #3E534A;
      margin: 0 8px 8px 0 !important;
      padding: 3px 8px;
      border-radius: 999px;
      max-width: 62vw;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      box-shadow: 0 4px 14px rgba(28,36,32,.12);
    }
    .leaflet-control-attribution a { color: inherit; }
  </style>
</head>
<body>
  <div id="map" role="application" aria-label="KNUST campus map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const words = { working: 'Working', broken: 'Broken', unknown: 'Unknown' };
    const kinds = { ramp: 'Ramp', lift: 'Lift', toilet: 'Accessible toilet', parking: 'Parking', entrance: 'Entrance' };
    const glyphs = ${JSON.stringify(glyph)};
    const post = (msg) => {
      const data = JSON.stringify(msg);
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(data);
      else window.parent.postMessage(data, '*');
    };
    let pending = null;
    let map = null;
    let layer = null;
    let osm = null;
    let quiet = false;
    let framed = false;
    const num = (value) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    };
    function pads(padding) {
      const p = padding || { top: 48, right: 24, bottom: 48, left: 24 };
      return {
        paddingTopLeft: [p.left || 24, p.top || 48],
        paddingBottomRight: [p.right || 24, p.bottom || 48]
      };
    }
    function pinHtml(kind, status, selected) {
      const body = selected ? '#083E32' : '#0F6E56';
      const stroke = selected ? '#E8A06A' : '#FFFFFF';
      const badge = status === 'broken' ? '#9B1C1C' : status === 'unknown' ? '#8A5A00' : '#0B5C34';
      const badgeName = status === 'broken' ? 'broken' : status === 'unknown' ? 'unknown' : 'check';
      const mark = 'fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round"';
      const icon = '<g transform="translate(24,19.5) scale(0.92) translate(-12,-12)" ' + mark + ' stroke-width="2.35">' + (glyphs[kind] || glyphs.entrance) + '</g>';
      const badgeMark = '<g transform="translate(37,10) scale(0.4) translate(-12,-12)" ' + mark + ' stroke-width="2.6">' + glyphs[badgeName] + '</g>';
      return '<svg width="48" height="56" viewBox="0 0 48 56"><ellipse cx="24" cy="52" rx="7" ry="2.2" fill="rgba(28,36,32,0.28)"/><path d="M24 50 C24 50 5 33 5 20 a19 19 0 0 1 38 0 C43 33 24 50 24 50 Z" fill="' + body + '" stroke="' + stroke + '" stroke-width="' + (selected ? 2.6 : 2) + '"/>' + icon + '<circle cx="37" cy="10" r="7" fill="' + badge + '" stroke="#fff" stroke-width="1.7"/>' + badgeMark + '</svg>';
    }
    function clusterHtml(count) {
      return '<div style="width:44px;height:44px;border-radius:22px;background:#0F6E56;color:#fff;text-align:center;line-height:38px;font:700 15px/38px sans-serif;border:3px solid #fff;box-shadow:0 6px 16px rgba(28,36,32,.22)">' + count + '</div>';
    }
    function iconFor(html, w, h, ax, ay) {
      return L.divIcon({ className: 'tek-pin', html: html, iconSize: [w, h], iconAnchor: [ax, ay] });
    }
    function fit(msg) {
      const pts = (msg.features || []).map((f) => [num(f.latitude), num(f.longitude)]).filter((p) => p[0] != null);
      if (!pts.length || !map) return;
      map.invalidateSize();
      map.fitBounds(pts, Object.assign({ maxZoom: 17 }, pads(msg.padding)));
      framed = true;
      post({ type: 'framed' });
    }
    function paintBase(mode) {
      if (osm && !map.hasLayer(osm)) osm.addTo(map);
      const darkMode = mode === 'dark';
      const pane = map.getPane('tilePane');
      if (pane) {
        pane.style.filter = darkMode
          ? (quiet
            ? 'invert(1) hue-rotate(180deg) brightness(0.78) contrast(0.88) saturate(0.4)'
            : 'invert(1) hue-rotate(180deg) brightness(0.93) contrast(0.92) saturate(0.8)')
          : (quiet ? 'saturate(0.45) brightness(1.03) contrast(0.96)' : 'none');
      }
      document.body.style.background = darkMode ? '#141816' : '#E7F0E4';
      const credit = document.querySelector('.leaflet-control-attribution');
      if (credit) {
        credit.style.background = darkMode ? 'rgba(16,22,20,.82)' : 'rgba(255,252,248,.9)';
        credit.style.color = darkMode ? '#F6F1E8' : '#3E534A';
      }
    }
    function draw(msg) {
      if (!layer || !map) return;
      paintBase(msg.mode === 'dark' ? 'dark' : 'light');
      layer.clearLayers();
      const items = (msg.features || []).map((feature) => {
        const lat = num(feature.latitude);
        const lng = num(feature.longitude);
        if (lat == null || lng == null) return null;
        return { feature: feature, lat: lat, lng: lng, point: map.latLngToLayerPoint([lat, lng]) };
      }).filter(Boolean);
      const used = {};
      const radius = map.getZoom() >= 17 ? 28 : 36;
      items.forEach((item, index) => {
        if (used[index]) return;
        const group = [item];
        used[index] = true;
        if (item.feature.id !== msg.selectedId) {
          items.forEach((other, otherIndex) => {
            if (used[otherIndex] || other.feature.id === msg.selectedId) return;
            const dx = item.point.x - other.point.x;
            const dy = item.point.y - other.point.y;
            if (dx * dx + dy * dy < radius * radius) {
              group.push(other);
              used[otherIndex] = true;
            }
          });
        }
        if (group.length > 1) {
          const marker = L.marker(map.layerPointToLatLng(item.point), {
            icon: iconFor(clusterHtml(group.length), 44, 44, 22, 22),
            zIndexOffset: 400
          });
          marker.on('click', () => {
            map.fitBounds(group.map((entry) => [entry.lat, entry.lng]), Object.assign({ maxZoom: map.getZoom() + 2 }, pads(msg.padding)));
          });
          marker.on('add', () => {
            const el = marker.getElement && marker.getElement();
            if (el) el.setAttribute('aria-label', group.length + ' nearby campus points. Zoom in.');
          });
          marker.addTo(layer);
          return;
        }
        const feature = group[0].feature;
        const status = feature.status === 'working' || feature.status === 'broken' ? feature.status : 'unknown';
        const selected = feature.id === msg.selectedId;
        const marker = L.marker([group[0].lat, group[0].lng], {
          icon: iconFor(pinHtml(feature.kind, status, selected), 48, 56, 24, 50),
          zIndexOffset: selected ? 800 : 200
        });
        marker.on('click', () => post({ type: 'select', id: feature.id }));
        marker.on('add', () => {
          const el = marker.getElement && marker.getElement();
          if (el) el.setAttribute('aria-label', feature.name + ', ' + (kinds[feature.kind] || feature.kind) + ', ' + (words[status] || 'Unknown'));
        });
        marker.addTo(layer);
      });
    }
    function placeChrome(msg) {
      const pad = (msg && msg.padding) || {};
      const bottom = Math.max(0, Number(pad.bottom) || 0);
      document.querySelectorAll('.leaflet-bottom').forEach((el) => { el.style.bottom = bottom + 'px'; });
    }
    function apply() {
      if (!map || !pending) return;
      placeChrome(pending);
      draw(pending);
      if (pending.fit || (!framed && pending.features && pending.features.length)) fit(pending);
      else if (pending.selectedId) {
        const hit = (pending.features || []).find((f) => f.id === pending.selectedId);
        const lat = hit && num(hit.latitude);
        const lng = hit && num(hit.longitude);
        if (lat != null) map.panInside([lat, lng], pads(pending.padding));
      }
    }
    window.tekpath = {
      update(msg) { pending = msg; apply(); },
      zoomBy(delta) { if (map) map.setZoom(map.getZoom() + delta); },
      recenter() { if (pending) fit(pending); },
      toggleLayer() {
        quiet = !quiet;
        if (pending) draw(pending);
        post({ type: 'layer', id: quiet ? 'quiet' : 'detail' });
      }
    };
    if (!window.L) {
      post({ type: 'map-error' });
    } else {
      map = L.map('map', { zoomControl: false, attributionControl: true }).setView([${campus.latitude}, ${campus.longitude}], 16);
      map.attributionControl.setPrefix('');
      osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }).addTo(map);
      layer = L.layerGroup().addTo(map);
      map.on('zoomend', () => { if (pending) draw(pending); });
      map.on('moveend', () => {
        const c = map.getCenter();
        post({ type: 'center', latitude: c.lat, longitude: c.lng });
      });
      setTimeout(() => { map.invalidateSize(); apply(); post({ type: 'ready' }); }, 40);
    }
  </script>
</body>
</html>`;

function encode(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export const CampusMap = forwardRef<MapHandle, Props>(function CampusMap(
  { features, selectedId, onSelect, onCenter, padding },
  ref,
) {
  const { mode } = useTheme();
  const webRef = useRef<WebView>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const framed = useRef(false);
  const latest = useRef({ features, selectedId, padding, mode });
  latest.current = { features, selectedId, padding, mode };

  const payload = useCallback((fit: boolean) => {
    const current = latest.current;
    return {
      fit,
      mode: current.mode,
      selectedId: current.selectedId ?? null,
      padding: current.padding ?? { top: 72, right: 24, bottom: 220, left: 64 },
      features: current.features
        .map((feature) => ({
          ...feature,
          latitude: Number(feature.latitude),
          longitude: Number(feature.longitude),
        }))
        .filter((feature) => Number.isFinite(feature.latitude) && Number.isFinite(feature.longitude)),
    };
  }, []);

  const send = useCallback(
    (fit: boolean) => {
      const message = payload(fit);
      if (Platform.OS === 'web') {
        const bridge = (frameRef.current?.contentWindow as (Window & { tekpath?: Bridge }) | null)?.tekpath;
        bridge?.update(message);
        return;
      }
      webRef.current?.injectJavaScript(`window.tekpath && window.tekpath.update(${encode(message)}); true;`);
    },
    [payload],
  );

  const command = useCallback((method: 'zoomBy' | 'recenter' | 'toggleLayer', arg?: number) => {
    if (Platform.OS === 'web') {
      const bridge = (frameRef.current?.contentWindow as (Window & { tekpath?: Bridge }) | null)?.tekpath;
      if (!bridge) return;
      if (method === 'zoomBy') bridge.zoomBy(arg ?? 0);
      else bridge[method]();
      return;
    }
    const js =
      method === 'zoomBy'
        ? `window.tekpath && window.tekpath.zoomBy(${arg ?? 0}); true;`
        : `window.tekpath && window.tekpath.${method}(); true;`;
    webRef.current?.injectJavaScript(js);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => command('zoomBy', 1),
      zoomOut: () => command('zoomBy', -1),
      recenter: () => {
        framed.current = false;
        command('recenter');
      },
      toggleLayer: () => command('toggleLayer'),
    }),
    [command],
  );

  useEffect(() => {
    send(!framed.current && features.length > 0);
  }, [features, selectedId, padding, mode, send]);

  const onMessage = useCallback(
    (raw: string) => {
      const data = parse(raw);
      if (!data) return;
      if (data.type === 'select' && typeof data.id === 'string') onSelect(data.id);
      if (data.type === 'center' && onCenter) onCenter(Number(data.latitude), Number(data.longitude));
      if (data.type === 'framed') framed.current = true;
      if (data.type === 'ready') send(!framed.current && latest.current.features.length > 0);
    },
    [onCenter, onSelect, send],
  );

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const listener = (event: MessageEvent) => {
      if (typeof event.data === 'string') onMessage(event.data);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [onMessage]);

  const html = useMemo(() => MAP_HTML, []);

  if (Platform.OS === 'web') {
    return (
      <View style={{ flex: 1, minHeight: 240, backgroundColor: mode === 'dark' ? '#1A2420' : '#E4EFE8' }}>
        {createElement('iframe', {
          title: 'KNUST campus map',
          srcDoc: html,
          ref: frameRef,
          onLoad: () => send(!framed.current && latest.current.features.length > 0),
          style: { border: 0, width: '100%', height: '100%', minHeight: 240 },
        })}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, minHeight: 240, backgroundColor: mode === 'dark' ? '#1A2420' : '#E4EFE8' }}>
      <WebView
        ref={webRef}
        originWhitelist={['*']}
        source={{ html }}
        javaScriptEnabled
        domStorageEnabled
        setBuiltInZoomControls={false}
        setDisplayZoomControls={false}
        onLoadEnd={() => send(!framed.current && latest.current.features.length > 0)}
        onMessage={(event: { nativeEvent: { data: string } }) => onMessage(event.nativeEvent.data)}
        accessibilityLabel="KNUST campus map"
      />
    </View>
  );
});

export function MapControls({
  mapRef,
  style,
}: {
  mapRef: RefObject<MapHandle | null>;
  style?: object;
}) {
  return (
    <View style={[{ gap: 10 }, style]}>
      <IconButton label="Zoom in" icon="add" onPress={() => mapRef.current?.zoomIn()} />
      <IconButton label="Zoom out" icon="remove" onPress={() => mapRef.current?.zoomOut()} />
      <IconButton label="Recenter on campus points" icon="locate" onPress={() => mapRef.current?.recenter()} />
      <IconButton label="Switch map style" icon="layers" onPress={() => mapRef.current?.toggleLayer()} />
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
