import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import Svg, { Circle, Polygon, Polyline, Text as SvgText } from 'react-native-svg';

import {
  ClusterMark,
  MapControls,
  PinMark,
  bboxFor,
  buildClusters,
  campusRegion,
  clampRegion,
  focusRegion,
  finitePoints,
  landColor,
  regionFor,
  zoomForDelta,
  type LatLng,
  type MapHandle,
  type MapProps,
  type Region,
} from '@/components/mapShared';
import { AppText } from '@/components/ui';
import { useTheme } from '@/context/Theme';

export type { MapHandle, MapPadding } from '@/components/mapShared';
export { MapControls };

/** Web stand-in. The phone uses Google Maps or Apple Maps via react-native-maps. */
export const CampusMap = forwardRef<MapHandle, MapProps>(function CampusMap(
  { features, selectedId, onSelect, onCenter, padding, route, polygon, onMapPress, focus, cornerPins, interactive = true },
  ref,
) {
  const { mode } = useTheme();
  const pad = padding ?? { top: 72, right: 24, bottom: 220, left: 64 };
  const regionRef = useRef<Region>(focus ? focusRegion(focus) : campusRegion);
  const [region, setRegion] = useState<Region>(focus ? focusRegion(focus) : campusRegion);
  const [size, setSize] = useState({ width: 390, height: 700 });
  const [quiet, setQuiet] = useState(false);
  const framed = useRef(false);
  const points = finitePoints(features);
  const line = (route ?? []).filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
  const { index, items } = buildClusters(points, bboxFor(region), zoomForDelta(region.longitudeDelta), selectedId);
  const selected = points.find((point) => point.id === selectedId) ?? null;

  function move(next: Region) {
    const clamped = clampRegion(next);
    regionRef.current = clamped;
    setRegion(clamped);
    onCenter?.(clamped.latitude, clamped.longitude);
  }

  function fit(coords: LatLng[]) {
    move(coords.length ? regionFor(coords, pad, size) : campusRegion);
  }

  useImperativeHandle(ref, () => ({
    zoomIn: () => move({ ...regionRef.current, latitudeDelta: regionRef.current.latitudeDelta / 2, longitudeDelta: regionRef.current.longitudeDelta / 2 }),
    zoomOut: () => move({ ...regionRef.current, latitudeDelta: regionRef.current.latitudeDelta * 2, longitudeDelta: regionRef.current.longitudeDelta * 2 }),
    recenter: () => fit(line.length > 1 ? line : points),
    toggleLayer: () => setQuiet((value) => !value),
  }));

  useEffect(() => {
    if (focus) move(focusRegion(focus));
    // Recentre when the outline search moves to a building.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.latitude, focus?.longitude]);

  useEffect(() => {
    if (line.length > 1) {
      fit(line);
      return;
    }
    if (!framed.current && points.length && size.width > 0) {
      fit(points);
      framed.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line.map((point) => `${point.latitude},${point.longitude}`).join('|'), points.length, size.width, size.height]);

  const stroke = mode === 'dark' ? '#7DDFC3' : '#0F6E56';
  const corners = (cornerPins ?? []).filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
  const tiles = osmTiles(region, size.width, size.height);
  const outline = (polygon ?? []).filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
  const outlinePath = outline
    .map((point) => {
      const spot = project(point, region, size.width, size.height);
      return `${spot.x},${spot.y}`;
    })
    .join(' ');
  const path = line
    .map((point) => {
      const spot = project(point, region, size.width, size.height);
      return `${spot.x},${spot.y}`;
    })
    .join(' ');

  return (
    <View
      accessibilityLabel="KNUST campus map"
      style={{ flex: 1, minHeight: 240, backgroundColor: quiet ? (mode === 'dark' ? '#171E1B' : '#E6E2D8') : landColor(mode), overflow: 'hidden' }}
      onLayout={(event) => setSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}>
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}>
        {tiles.map((tile) => (
          <Image
            key={tile.key}
            source={{ uri: tile.uri }}
            fadeDuration={0}
            style={{ position: 'absolute', left: tile.left, top: tile.top, width: tile.width, height: tile.height }}
          />
        ))}
      </View>
      {mode === 'dark' ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(8,14,12,0.38)' }} />
      ) : null}
      {onMapPress ? (
        <Pressable
          accessibilityLabel="Map. Tap to add a corner."
          style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}
          onPress={(event) => {
            const native = event.nativeEvent as { locationX?: number; locationY?: number; clientX?: number; clientY?: number };
            let x = Number(native.locationX);
            let y = Number(native.locationY);
            const node = event.currentTarget as unknown as { getBoundingClientRect?: () => { left: number; top: number } };
            const clientX = native.clientX;
            const clientY = native.clientY;
            if ((!Number.isFinite(x) || !Number.isFinite(y)) && node.getBoundingClientRect && clientX != null && clientY != null) {
              const rect = node.getBoundingClientRect();
              x = clientX - rect.left;
              y = clientY - rect.top;
            }
            if (!Number.isFinite(x) || !Number.isFinite(y)) return;
            onMapPress(unproject(x, y, region, size.width, size.height));
          }}
        />
      ) : null}
      {outline.length > 2 || line.length > 1 || corners.length ? (
        <Svg width={size.width} height={size.height} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
          {outline.length > 2 ? <Polygon points={outlinePath} fill={mode === 'dark' ? 'rgba(17,122,99,0.35)' : 'rgba(15,110,86,0.22)'} stroke={stroke} strokeWidth={2} /> : null}
          {line.length > 1 ? <Polyline points={path} fill="none" stroke={mode === 'dark' ? '#0E1613' : '#FFFFFF'} strokeWidth={8} strokeLinejoin="round" strokeLinecap="round" /> : null}
          {line.length > 1 ? <Polyline points={path} fill="none" stroke={stroke} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" /> : null}
          {corners.map((coord, index) => {
            const spot = project(coord, region, size.width, size.height);
            return (
              <Circle key={`corner-${index}`} cx={spot.x} cy={spot.y} r={12} fill={stroke} stroke="#FFFFFF" strokeWidth={2} />
            );
          })}
          {corners.map((coord, index) => {
            const spot = project(coord, region, size.width, size.height);
            return (
              <SvgText key={`corner-n-${index}`} x={spot.x} y={spot.y + 4} fill="#FFFFFF" fontSize={12} fontWeight="700" textAnchor="middle">
                {index + 1}
              </SvgText>
            );
          })}
        </Svg>
      ) : null}
      {items.map((item) => {
        const [longitude, latitude] = item.geometry.coordinates;
        const props = item.properties;
        const spot = project({ latitude, longitude }, region, size.width, size.height);
        if (props && 'cluster' in props && props.cluster) {
          return (
            <Pressable
              key={`cluster-${props.cluster_id}`}
              accessibilityRole="button"
              accessibilityLabel={`${props.point_count} nearby places. Zoom in.`}
              disabled={!interactive}
              onPress={() => {
                const zoom = index.getClusterExpansionZoom(props.cluster_id);
                const delta = 360 / 2 ** zoom;
                move({ latitude, longitude, latitudeDelta: delta, longitudeDelta: delta });
              }}
              style={({ pressed }) => ({ position: 'absolute', left: spot.x - 22, top: spot.y - 22, opacity: pressed ? 0.75 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] })}>
              <ClusterMark count={props.point_count} />
            </Pressable>
          );
        }
        if (!props || !('id' in props)) return null;
        return (
          <Pressable
            key={props.id}
            accessibilityRole="button"
            accessibilityLabel={props.name}
            disabled={!interactive}
            onPress={() => onSelect(props.id)}
            style={({ pressed }) => ({ position: 'absolute', left: spot.x - 24, top: spot.y - 56, opacity: pressed ? 0.8 : 1 })}>
            <PinMark kind={props.kind} status={props.status} />
          </Pressable>
        );
      })}
      <AppText
        size={12}
        weight="700"
        color={mode === 'dark' ? '#8FCBB8' : '#0F6E56'}
        style={{ position: 'absolute', left: 16, bottom: pad.bottom + 10 }}>
        KNUST · © OpenStreetMap
      </AppText>
      {selected ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={selected.name}
          onPress={() => onSelect(selected.id)}
          style={{
            position: 'absolute',
            left: project(selected, region, size.width, size.height).x - 24,
            top: project(selected, region, size.width, size.height).y - 56,
          }}>
          <PinMark kind={selected.kind} status={selected.status} selected />
        </Pressable>
      ) : null}
    </View>
  );
});

function mercatorX(longitude: number) {
  return (longitude + 180) / 360;
}

function mercatorY(latitude: number) {
  const clamped = Math.max(-85, Math.min(85, latitude));
  const rad = (clamped * Math.PI) / 180;
  return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2;
}

function frame(region: Region) {
  const west = region.longitude - region.longitudeDelta / 2;
  const east = region.longitude + region.longitudeDelta / 2;
  const north = region.latitude + region.latitudeDelta / 2;
  const south = region.latitude - region.latitudeDelta / 2;
  return { x0: mercatorX(west), x1: mercatorX(east), y0: mercatorY(north), y1: mercatorY(south) };
}

function project(coord: LatLng, region: Region, width: number, height: number) {
  const box = frame(region);
  return {
    x: ((mercatorX(coord.longitude) - box.x0) / (box.x1 - box.x0)) * width,
    y: ((mercatorY(coord.latitude) - box.y0) / (box.y1 - box.y0)) * height,
  };
}

function unproject(x: number, y: number, region: Region, width: number, height: number): LatLng {
  const box = frame(region);
  const mx = box.x0 + (x / Math.max(width, 1)) * (box.x1 - box.x0);
  const my = box.y0 + (y / Math.max(height, 1)) * (box.y1 - box.y0);
  const longitude = mx * 360 - 180;
  const latitude = (Math.atan(Math.sinh(Math.PI * (1 - 2 * my))) * 180) / Math.PI;
  return { longitude, latitude };
}

function osmTiles(region: Region, width: number, height: number) {
  if (width < 20 || height < 20) return [];
  const box = frame(region);
  let zoom = Math.max(13, Math.min(18, Math.round(zoomForDelta(region.longitudeDelta))));
  let tiles: { key: string; uri: string; left: number; top: number; width: number; height: number }[] = [];
  while (zoom >= 13) {
    const scale = 2 ** zoom;
    const x0 = Math.floor(box.x0 * scale);
    const x1 = Math.floor(box.x1 * scale);
    const y0 = Math.floor(box.y0 * scale);
    const y1 = Math.floor(box.y1 * scale);
    const count = (x1 - x0 + 1) * (y1 - y0 + 1);
    if (count > 24 && zoom > 13) {
      zoom -= 1;
      continue;
    }
    tiles = [];
    for (let x = x0; x <= x1; x += 1) {
      for (let y = y0; y <= y1; y += 1) {
        const wrapped = ((x % scale) + scale) % scale;
        tiles.push({
          key: `${zoom}/${x}/${y}`,
          uri: `https://tile.openstreetmap.org/${zoom}/${wrapped}/${y}.png`,
          left: ((x / scale - box.x0) / (box.x1 - box.x0)) * width,
          top: ((y / scale - box.y0) / (box.y1 - box.y0)) * height,
          width: (1 / scale / (box.x1 - box.x0)) * width + 0.5,
          height: (1 / scale / (box.y1 - box.y0)) * height + 0.5,
        });
      }
    }
    break;
  }
  return tiles;
}
