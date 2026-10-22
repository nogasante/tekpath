import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

import {
  ClusterMark,
  MapControls,
  PinMark,
  bboxFor,
  buildClusters,
  campusRegion,
  clampRegion,
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
  { features, selectedId, onSelect, onCenter, padding, route, interactive = true },
  ref,
) {
  const { mode } = useTheme();
  const pad = padding ?? { top: 72, right: 24, bottom: 220, left: 64 };
  const regionRef = useRef<Region>(campusRegion);
  const [region, setRegion] = useState<Region>(campusRegion);
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
      {line.length > 1 ? (
        <Svg width={size.width} height={size.height} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
          <Polyline points={path} fill="none" stroke={mode === 'dark' ? '#0E1613' : '#FFFFFF'} strokeWidth={8} strokeLinejoin="round" strokeLinecap="round" />
          <Polyline points={path} fill="none" stroke={stroke} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
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
        KNUST
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

function project(coord: LatLng, region: Region, width: number, height: number) {
  const west = region.longitude - region.longitudeDelta / 2;
  const north = region.latitude + region.latitudeDelta / 2;
  return {
    x: ((coord.longitude - west) / region.longitudeDelta) * width,
    y: ((north - coord.latitude) / region.latitudeDelta) * height,
  };
}
