import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import MapView, { Marker, Polygon, Polyline, PROVIDER_GOOGLE, type Region as NativeRegion } from 'react-native-maps';

import {
  ClusterMark,
  MapControls,
  PinMark,
  bboxFor,
  buildClusters,
  campusBounds,
  campusRegion,
  clampRegion,
  focusRegion,
  finitePoints,
  landColor,
  mapStyleFor,
  regionFor,
  zoomForDelta,
  type LatLng,
  type MapHandle,
  type MapPadding,
  type MapProps,
  type Region,
} from '@/components/mapShared';
import { AppText } from '@/components/ui';
import { useTheme } from '@/context/Theme';

export type { MapHandle, MapPadding } from '@/components/mapShared';
export { MapControls };

const provider = Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined;

export const CampusMap = forwardRef<MapHandle, MapProps>(function CampusMap(
  { features, selectedId, onSelect, onCenter, padding, route, polygon, onMapPress, focus, cornerPins, interactive = true },
  ref,
) {
  const { mode, reduceMotion } = useTheme();
  const pad = useMemo<MapPadding>(
    () => padding ?? { top: 72, right: 24, bottom: 220, left: 64 },
    [padding?.top, padding?.right, padding?.bottom, padding?.left],
  );
  const mapRef = useRef<MapView>(null);
  const regionRef = useRef<Region>(focus ? focusRegion(focus) : campusRegion);
  const readyRef = useRef(false);
  const [region, setRegion] = useState<Region>(focus ? focusRegion(focus) : campusRegion);
  const [quiet, setQuiet] = useState(false);
  const [ready, setReady] = useState(false);
  const mapStyle = useMemo(() => mapStyleFor(mode, quiet), [mode, quiet]);
  const [size, setSize] = useState({ width: 360, height: 640 });
  const framed = useRef(false);
  const points = finitePoints(features);
  const line = (route ?? []).filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
  const { index, items } = buildClusters(points, bboxFor(region), zoomForDelta(region.longitudeDelta), selectedId);
  const selected = points.find((point) => point.id === selectedId) ?? null;

  function move(next: Region, animated: boolean) {
    const clamped = clampRegion(next);
    regionRef.current = clamped;
    setRegion(clamped);
    // animateToRegion and fitToCoordinates both touch GoogleMap. Skip them until onMapReady.
    if (!readyRef.current) return;
    mapRef.current?.animateToRegion(clamped, animated && !reduceMotion ? 420 : 0);
  }

  function fit(coords: LatLng[], animated: boolean) {
    if (!coords.length) {
      move(campusRegion, animated);
      return;
    }
    move(regionFor(coords, pad, size), animated);
  }

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => move({ ...regionRef.current, latitudeDelta: regionRef.current.latitudeDelta / 2, longitudeDelta: regionRef.current.longitudeDelta / 2 }, true),
      zoomOut: () => move({ ...regionRef.current, latitudeDelta: regionRef.current.latitudeDelta * 2, longitudeDelta: regionRef.current.longitudeDelta * 2 }, true),
      recenter: () => fit(line.length > 1 ? line : points, true),
      toggleLayer: () => setQuiet((value) => !value),
    }),
    // fit closes over the latest points. The handle is recreated when those change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [line, points, pad, size],
  );

  useEffect(() => {
    if (!ready || !focus) return;
    move(focusRegion(focus), true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, focus?.latitude, focus?.longitude]);

  useEffect(() => {
    if (!ready) return;
    if (line.length > 1) {
      fit(line, true);
      return;
    }
    if (!framed.current && points.length) {
      fit(points, true);
      framed.current = true;
    }
    // Fit when the route or the first batch of places arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, line.map((point) => `${point.latitude},${point.longitude}`).join('|'), points.length]);

  useEffect(() => {
    if (!ready || !selected) return;
    move(
      {
        ...regionRef.current,
        latitude: Number(selected.latitude),
        longitude: Number(selected.longitude),
        latitudeDelta: Math.min(regionRef.current.latitudeDelta, 0.008),
        longitudeDelta: Math.min(regionRef.current.longitudeDelta, 0.008),
      },
      true,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, ready]);

  const stroke = mode === 'dark' ? '#7DDFC3' : '#0F6E56';
  const casing = mode === 'dark' ? '#0E1613' : '#FFFFFF';
  const outline = (polygon ?? []).filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));

  return (
    <View
      style={{ flex: 1, minHeight: 240, backgroundColor: landColor(mode) }}
      onLayout={(event) => setSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}>
      <MapView
        ref={mapRef}
        provider={provider}
        style={{ flex: 1 }}
        initialRegion={focus ? focusRegion(focus) : campusRegion}
        customMapStyle={ready ? mapStyle : undefined}
        userInterfaceStyle={mode}
        showsUserLocation={interactive}
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        minZoomLevel={13}
        maxZoomLevel={19}
        mapPadding={ready ? pad : undefined}
        loadingBackgroundColor={landColor(mode)}
        accessibilityLabel="KNUST campus map"
        onMapReady={() => {
          readyRef.current = true;
          mapRef.current?.setMapBoundaries(campusBounds.northEast, campusBounds.southWest);
          setReady(true);
        }}
        onPress={(event) => {
          const coord = event.nativeEvent.coordinate;
          if (onMapPress && coord) onMapPress({ latitude: coord.latitude, longitude: coord.longitude });
        }}
        onRegionChangeComplete={(next: NativeRegion) => {
          const clamped = clampRegion(next);
          regionRef.current = clamped;
          setRegion(clamped);
          onCenter?.(clamped.latitude, clamped.longitude);
        }}>
        {(cornerPins ?? [])
          .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude))
          .map((point, index) => (
            <Marker
              key={`corner-${index}`}
              coordinate={point}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges
              accessibilityLabel={`Corner ${index + 1}`}>
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: stroke,
                  borderWidth: 2,
                  borderColor: '#FFFFFF',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <AppText size={13} weight="700" color="#FFFFFF">
                  {index + 1}
                </AppText>
              </View>
            </Marker>
          ))}
        {outline.length > 2 ? (
          <Polygon
            coordinates={outline}
            strokeColor={stroke}
            fillColor={mode === 'dark' ? 'rgba(17,122,99,0.35)' : 'rgba(15,110,86,0.22)'}
            strokeWidth={2}
          />
        ) : null}
        {line.length > 1 ? (
          <Polyline coordinates={line} strokeColor={casing} strokeWidth={8} lineCap="round" lineJoin="round" />
        ) : null}
        {line.length > 1 ? (
          <Polyline coordinates={line} strokeColor={stroke} strokeWidth={4} lineCap="round" lineJoin="round" />
        ) : null}
        {items.map((item) => {
          const [longitude, latitude] = item.geometry.coordinates;
          const props = item.properties;
          if (props && 'cluster' in props && props.cluster) {
            const count = props.point_count;
            return (
              <Marker
                key={`cluster-${props.cluster_id}`}
                coordinate={{ latitude, longitude }}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges
                onPress={() => {
                  const zoom = index.getClusterExpansionZoom(props.cluster_id);
                  const delta = 360 / 2 ** zoom;
                  move({ latitude, longitude, latitudeDelta: delta, longitudeDelta: delta }, true);
                }}
                accessibilityLabel={`${count} nearby places. Zoom in.`}>
                <ClusterMark count={count} />
              </Marker>
            );
          }
          if (!props || !('id' in props)) return null;
          return (
            <PlaceMarker
              key={props.id}
              id={props.id}
              kind={props.kind}
              status={props.status}
              name={props.name}
              latitude={latitude}
              longitude={longitude}
              selected={false}
              onSelect={onSelect}
            />
          );
        })}
        {selected ? (
          <PlaceMarker
            key={`selected-${selected.id}`}
            id={selected.id}
            kind={selected.kind}
            status={selected.status}
            name={selected.name}
            latitude={Number(selected.latitude)}
            longitude={Number(selected.longitude)}
            selected
            onSelect={onSelect}
          />
        ) : null}
      </MapView>
    </View>
  );
});

function PlaceMarker({
  id,
  kind,
  status,
  name,
  latitude,
  longitude,
  selected,
  onSelect,
}: {
  id: string;
  kind: string;
  status: string;
  name: string;
  latitude: number;
  longitude: number;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const [tracking, setTracking] = useState(true);
  useEffect(() => {
    setTracking(true);
    const timer = setTimeout(() => setTracking(false), 500);
    return () => clearTimeout(timer);
  }, [kind, status, selected]);
  const words = status === 'broken' ? 'Broken' : status === 'working' ? 'Working' : 'Unknown';
  return (
    <Marker
      coordinate={{ latitude, longitude }}
      anchor={{ x: 0.5, y: 1 }}
      tracksViewChanges={tracking}
      zIndex={selected ? 8 : 2}
      onPress={() => onSelect(id)}
      accessibilityLabel={`${name}, ${words}`}>
      <View collapsable={false} style={{ width: 48, height: 56 }}>
        <PinMark kind={kind} status={status} selected={selected} />
      </View>
    </Marker>
  );
}
