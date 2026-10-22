import { createElement, forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, type RefObject } from 'react';
import { Platform, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { IconButton } from '@/components/ui';
import { campus, markerInk } from '@/lib/theme';
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
    html, body, #map { height: 100%; margin: 0; background: #d7e4d4; }
    .leaflet-control-zoom { display: none; }
    .leaflet-control-attribution {
      font: 10px/1.2 sans-serif;
      background: rgba(255,255,255,.82);
      color: #3E534A;
      margin: 0 6px 6px 0 !important;
      padding: 2px 6px;
      border-radius: 8px;
      max-width: 46vw;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .tek-tip {
      background: transparent !important;
      border: 0 !important;
      box-shadow: none !important;
      color: #fff;
      font: 700 12px/1 sans-serif;
      padding: 0 !important;
      margin: 0 !important;
    }
    .tek-tip::before { display: none !important; }
  </style>
</head>
<body>
  <div id="map" role="application" aria-label="KNUST campus map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const ink = ${JSON.stringify(markerInk)};
    const letters = { ramp: 'R', lift: 'L', toilet: 'T', parking: 'P', entrance: 'E' };
    const symbols = { working: '✓', broken: '!', unknown: '?' };
    const words = { working: 'Working', broken: 'Broken', unknown: 'Unknown' };
    const post = (msg) => {
      const data = JSON.stringify(msg);
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(data);
      else window.parent.postMessage(data, '*');
    };
    let pending = null;
    let map = null;
    let layer = null;
    let streets = null;
    let quiet = null;
    let active = null;
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
    function fit(msg) {
      const pts = (msg.features || []).map((f) => [num(f.latitude), num(f.longitude)]).filter((p) => p[0] != null);
      if (!pts.length || !map) return;
      map.invalidateSize();
      map.fitBounds(pts, Object.assign({ maxZoom: 17 }, pads(msg.padding)));
      framed = true;
      post({ type: 'framed' });
    }
    function draw(msg) {
      if (!layer) return;
      layer.clearLayers();
      (msg.features || []).forEach((feature) => {
        const lat = num(feature.latitude);
        const lng = num(feature.longitude);
        if (lat == null || lng == null) return;
        const status = feature.status === 'working' || feature.status === 'broken' ? feature.status : 'unknown';
        const selected = feature.id === msg.selectedId;
        const color = ink[status] || ink.unknown;
        const letter = letters[feature.kind] || '•';
        const symbol = symbols[status];
        const marker = L.circleMarker([lat, lng], {
          radius: selected ? 18 : 15,
          color: selected ? ink.brand : '#ffffff',
          weight: selected ? 4 : 3,
          fillColor: color,
          fillOpacity: 1,
          bubblingMouseEvents: false
        });
        marker.bindTooltip(letter + symbol, {
          permanent: true,
          direction: 'center',
          className: 'tek-tip',
          opacity: 1
        });
        marker.on('click', () => post({ type: 'select', id: feature.id }));
        marker.on('add', () => {
          const el = marker.getElement && marker.getElement();
          if (el) el.setAttribute('aria-label', feature.name + ', ' + (words[status] || 'Unknown'));
        });
        marker.addTo(layer);
      });
    }
    function placeChrome(msg) {
      const pad = (msg && msg.padding) || {};
      const bottom = Math.max(0, Number(pad.bottom) || 0);
      document.querySelectorAll('.leaflet-bottom').forEach((el) => {
        el.style.bottom = bottom + 'px';
      });
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
        if (!map || !streets || !quiet) return;
        map.removeLayer(active);
        active = active === streets ? quiet : streets;
        active.addTo(map);
        post({ type: 'layer', id: active === quiet ? 'quiet' : 'streets' });
      }
    };
    if (!window.L) {
      post({ type: 'map-error' });
    } else {
      map = L.map('map', { zoomControl: false, attributionControl: true }).setView([${campus.latitude}, ${campus.longitude}], 15);
      map.attributionControl.setPrefix('');
      streets = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
      });
      quiet = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd',
        attribution: '© OpenStreetMap © CARTO'
      });
      active = streets.addTo(map);
      layer = L.layerGroup().addTo(map);
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
  const webRef = useRef<WebView>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const framed = useRef(false);
  const latest = useRef({ features, selectedId, padding });
  latest.current = { features, selectedId, padding };

  const payload = useCallback((fit: boolean) => {
    const current = latest.current;
    return {
      fit,
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
    const fit = !framed.current && features.length > 0;
    send(fit);
  }, [features, selectedId, padding, send]);

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
      <View style={{ flex: 1, minHeight: 240, backgroundColor: '#d7e4d4' }}>
        {createElement('iframe', {
          title: 'KNUST campus map, OpenStreetMap',
          srcDoc: html,
          ref: frameRef,
          onLoad: () => send(!framed.current && latest.current.features.length > 0),
          style: { border: 0, width: '100%', height: '100%', minHeight: 240 },
        })}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, minHeight: 240 }}>
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
    <View style={[{ gap: 8 }, style]}>
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
