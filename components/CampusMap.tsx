import { createElement, forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, type RefObject } from 'react';
import { Platform, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { IconButton } from '@/components/ui';
import { useTheme } from '@/context/Theme';
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
      max-width: 54vw;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      box-shadow: 0 4px 14px rgba(28,36,32,.12);
    }
  </style>
</head>
<body>
  <div id="map" role="application" aria-label="KNUST campus map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const words = { working: 'Working', broken: 'Broken', unknown: 'Unknown' };
    const kinds = { ramp: 'Ramp', lift: 'Lift', toilet: 'Accessible toilet', parking: 'Parking', entrance: 'Entrance' };
    const glyphs = {
      ramp: '<path d="M12 26 L27 14" stroke="#fff" stroke-width="2.3" stroke-linecap="round"/><path d="M21 14 h6 v6" fill="none" stroke="#fff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>',
      lift: '<path d="M15 13 v8 M12.4 16.2 L15 13.6 L17.6 16.2 M25 25 V16 M22.4 21.6 L25 24.2 L27.6 21.6" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
      toilet: '<circle cx="20" cy="14" r="2.2" fill="#fff"/><path d="M20 17.2 v4 M16.8 25 L20 21 L23.2 25" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round"/>',
      parking: '<path d="M16.2 26 V13 H21.2 a4.2 4.2 0 0 1 0 8.4 H16.2" fill="none" stroke="#fff" stroke-width="2.1" stroke-linejoin="round"/>',
      entrance: '<path d="M14 26 V15 h12 v11 M14 15 l6-4 6 4" fill="none" stroke="#fff" stroke-width="1.9" stroke-linejoin="round"/>'
    };
    const post = (msg) => {
      const data = JSON.stringify(msg);
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(data);
      else window.parent.postMessage(data, '*');
    };
    let pending = null;
    let map = null;
    let layer = null;
    let voyager = null;
    let positron = null;
    let dark = null;
    let darkQuiet = null;
    let active = null;
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
      const mark = status === 'broken'
        ? '<path d="M31 6.4 v4 M31 12.2 v.8" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>'
        : status === 'unknown'
          ? '<path d="M31 5.6 c1.3 0 2.1.7 2.1 1.7 0 1.5-2.1 1.6-2.1 3 M31 12.4 v.6" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>'
          : '<path d="M28.2 9.2 l1.7 1.7 3.2-3.4" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>';
      return '<svg width="44" height="52" viewBox="0 0 44 52"><ellipse cx="22" cy="48" rx="7" ry="2.2" fill="rgba(28,36,32,0.28)"/><path d="M22 46 C22 46 6 30 6 18.5 a16 16 0 0 1 32 0 C38 30 22 46 22 46 Z" fill="' + body + '" stroke="' + stroke + '" stroke-width="' + (selected ? 3 : 2) + '"/><g transform="translate(2 0)">' + (glyphs[kind] || glyphs.entrance) + '</g><circle cx="33" cy="9" r="6.4" fill="' + badge + '" stroke="#fff" stroke-width="1.6"/>' + mark + '</svg>';
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
    function chooseBase(mode) {
      if (mode === 'dark') return quiet ? darkQuiet : dark;
      return quiet ? positron : voyager;
    }
    function paintBase(mode) {
      const next = chooseBase(mode);
      if (!next || next === active) return;
      if (active) map.removeLayer(active);
      next.addTo(map);
      active = next;
      const darkMode = mode === 'dark';
      document.body.style.background = darkMode ? '#1A2420' : '#E4EFE8';
      const credit = document.querySelector('.leaflet-control-attribution');
      if (credit) {
        credit.style.background = darkMode ? 'rgba(16,22,20,.78)' : 'rgba(255,252,248,.88)';
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
          icon: iconFor(pinHtml(feature.kind, status, selected), 44, 52, 22, 46),
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
      const carto = { maxZoom: 20, subdomains: 'abcd' };
      voyager = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', Object.assign({ attribution: '© OpenStreetMap © CARTO' }, carto));
      positron = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', Object.assign({ attribution: '© OpenStreetMap © CARTO' }, carto));
      dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', Object.assign({ attribution: '© OpenStreetMap © CARTO' }, carto));
      darkQuiet = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', Object.assign({ attribution: '© OpenStreetMap © CARTO' }, carto));
      active = voyager.addTo(map);
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
