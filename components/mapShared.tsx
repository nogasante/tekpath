import { type RefObject } from 'react';
import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import Supercluster from 'supercluster';

import { glyph } from '@/components/glyphs';
import { AppText, IconButton } from '@/components/ui';
import { campus } from '@/lib/theme';

export type MapPadding = { top: number; right: number; bottom: number; left: number };

export type MapHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
  recenter: () => void;
  toggleLayer: () => void;
};

export type MapPoint = {
  id: string;
  name: string;
  kind: string;
  status: string;
  latitude: number;
  longitude: number;
};

export type LatLng = { latitude: number; longitude: number };

export type MapProps = {
  features: MapPoint[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  onCenter?: (latitude: number, longitude: number) => void;
  padding?: MapPadding;
  route?: LatLng[];
  polygon?: LatLng[];
  onMapPress?: (coord: LatLng) => void;
  /** Centre the map here, for tracing a building rather than the whole campus. */
  focus?: LatLng;
  interactive?: boolean;
};

export function focusRegion(focus?: LatLng | null): Region {
  if (!focus) return campusRegion;
  return clampRegion({
    latitude: focus.latitude,
    longitude: focus.longitude,
    latitudeDelta: 0.0015,
    longitudeDelta: 0.0015,
  });
}

/** KNUST main campus, with a little room around the mapped buildings. */
export const campusBounds = {
  northEast: { latitude: 6.698, longitude: -1.548 },
  southWest: { latitude: 6.655, longitude: -1.595 },
};

export const campusRegion = {
  latitude: campus.latitude,
  longitude: campus.longitude,
  latitudeDelta: 0.012,
  longitudeDelta: 0.012,
};

export type Region = typeof campusRegion;

type StyleRule = {
  featureType?: string;
  elementType?: string;
  stylers: Record<string, string>[];
};

const hideNoise: StyleRule[] = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', stylers: [{ visibility: 'on' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
];

export const lightMapStyle: StyleRule[] = [
  ...hideNoise,
  { elementType: 'geometry', stylers: [{ color: '#F3F0E8' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#3E534A' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#F7F4EF' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#D7EBE3' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#0F6E56' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#E4DCD2' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#F8E8DE' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#5C6F66' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#C5E3DA' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#0F6E56' }] },
];

export const lightQuietStyle: StyleRule[] = [
  ...lightMapStyle,
  { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#E7E4DC' }] },
];

export const darkMapStyle: StyleRule[] = [
  ...hideNoise,
  { elementType: 'geometry', stylers: [{ color: '#1C2622' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#C5D0C9' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#101614' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#24362E' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#8FCBB8' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2C3A34' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#17211D' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3A3330' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#143E36' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#8FCBB8' }] },
];

export const darkQuietStyle: StyleRule[] = [
  ...darkMapStyle,
  { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
];

export function mapStyleFor(mode: 'light' | 'dark', quiet: boolean) {
  if (mode === 'dark') return quiet ? darkQuietStyle : darkMapStyle;
  return quiet ? lightQuietStyle : lightMapStyle;
}

export function landColor(mode: 'light' | 'dark') {
  return mode === 'dark' ? '#1C2622' : '#F3F0E8';
}

const badgeFill = { working: '#0B5C34', broken: '#9B1C1C', unknown: '#8A5A00' } as const;

export function pinXml(kind: string, status: string, selected: boolean) {
  const body = selected ? '#083E32' : '#0F6E56';
  const stroke = selected ? '#E8A06A' : '#FFFFFF';
  const tone = status === 'broken' || status === 'unknown' ? status : 'working';
  const badgeName = status === 'broken' ? 'broken' : status === 'unknown' ? 'unknown' : 'check';
  const mark = 'fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round"';
  const icon = `<g transform="translate(24,19.5) scale(0.92) translate(-12,-12)" ${mark} stroke-width="2.35">${glyph[kind] || glyph.entrance}</g>`;
  const badge = `<g transform="translate(37,10) scale(0.4) translate(-12,-12)" ${mark} stroke-width="2.6">${glyph[badgeName]}</g>`;
  return `<svg width="48" height="56" viewBox="0 0 48 56"><ellipse cx="24" cy="52" rx="7" ry="2.2" fill="rgba(28,36,32,0.28)"/><path d="M24 50 C24 50 5 33 5 20 a19 19 0 0 1 38 0 C43 33 24 50 24 50 Z" fill="${body}" stroke="${stroke}" stroke-width="${selected ? 2.6 : 2}"/>${icon}<circle cx="37" cy="10" r="7" fill="${badgeFill[tone]}" stroke="#fff" stroke-width="1.7"/>${badge}</svg>`;
}

export function PinMark({ kind, status, selected }: { kind: string; status: string; selected?: boolean }) {
  return <SvgXml xml={pinXml(kind, status, !!selected)} width={48} height={56} />;
}

export function ClusterMark({ count }: { count: number }) {
  return (
    <View
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#0F6E56',
        borderWidth: 3,
        borderColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <AppText weight="700" color="#FFFFFF" size={15}>
        {count}
      </AppText>
    </View>
  );
}

type PinProps = { id: string; kind: string; status: string; name: string };

export function buildClusters(points: MapPoint[], bbox: [number, number, number, number], zoom: number, selectedId?: string | null) {
  const index = new Supercluster<PinProps>({ radius: 56, maxZoom: 17, minPoints: 2 });
  index.load(
    points
      .filter((point) => point.id !== selectedId && Number.isFinite(point.latitude) && Number.isFinite(point.longitude))
      .map((point) => ({
        type: 'Feature' as const,
        properties: { id: point.id, kind: point.kind, status: point.status, name: point.name },
        geometry: { type: 'Point' as const, coordinates: [point.longitude, point.latitude] },
      })),
  );
  const zoomLevel = Math.max(0, Math.min(17, Math.round(zoom)));
  return { index, items: index.getClusters(bbox, zoomLevel) };
}

export function zoomForDelta(longitudeDelta: number) {
  return Math.log2(360 / Math.max(longitudeDelta, 0.00005));
}

export function bboxFor(region: Region): [number, number, number, number] {
  return [
    region.longitude - region.longitudeDelta / 2,
    region.latitude - region.latitudeDelta / 2,
    region.longitude + region.longitudeDelta / 2,
    region.latitude + region.latitudeDelta / 2,
  ];
}

export function clampRegion(region: Region): Region {
  const latitudeDelta = Math.min(0.05, Math.max(0.0015, region.latitudeDelta));
  const longitudeDelta = Math.min(0.05, Math.max(0.0015, region.longitudeDelta));
  const latitude = Math.min(
    campusBounds.northEast.latitude - latitudeDelta / 2,
    Math.max(campusBounds.southWest.latitude + latitudeDelta / 2, region.latitude),
  );
  const longitude = Math.min(
    campusBounds.northEast.longitude - longitudeDelta / 2,
    Math.max(campusBounds.southWest.longitude + longitudeDelta / 2, region.longitude),
  );
  return { latitude, longitude, latitudeDelta, longitudeDelta };
}

export function regionFor(coords: LatLng[], padding: MapPadding, size: { width: number; height: number }): Region {
  if (!coords.length) return campusRegion;
  let minLat = 90;
  let maxLat = -90;
  let minLng = 180;
  let maxLng = -180;
  for (const coord of coords) {
    minLat = Math.min(minLat, coord.latitude);
    maxLat = Math.max(maxLat, coord.latitude);
    minLng = Math.min(minLng, coord.longitude);
    maxLng = Math.max(maxLng, coord.longitude);
  }
  const width = Math.max(size.width, 200);
  const height = Math.max(size.height, 200);
  const usableW = Math.max(80, width - padding.left - padding.right);
  const usableH = Math.max(80, height - padding.top - padding.bottom);
  const latitudeDelta = Math.max(0.004, (maxLat - minLat) * 1.35) * (height / usableH);
  const longitudeDelta = Math.max(0.004, (maxLng - minLng) * 1.35) * (width / usableW);
  return clampRegion({
    latitude: (minLat + maxLat) / 2 + ((padding.bottom - padding.top) / height) * latitudeDelta * 0.5,
    longitude: (minLng + maxLng) / 2 + ((padding.left - padding.right) / width) * longitudeDelta * 0.5,
    latitudeDelta,
    longitudeDelta,
  });
}

export function finitePoints(features: MapPoint[]) {
  return features.filter((feature) => Number.isFinite(Number(feature.latitude)) && Number.isFinite(Number(feature.longitude)));
}

export function MapControls({ mapRef, style }: { mapRef: RefObject<MapHandle | null>; style?: object }) {
  return (
    <View style={[{ gap: 10 }, style]}>
      <IconButton label="Zoom in" icon="add" onPress={() => mapRef.current?.zoomIn()} />
      <IconButton label="Zoom out" icon="remove" onPress={() => mapRef.current?.zoomOut()} />
      <IconButton label="Recenter on campus" icon="locate" onPress={() => mapRef.current?.recenter()} />
      <IconButton label="Switch map style" icon="layers" onPress={() => mapRef.current?.toggleLayer()} />
    </View>
  );
}
