"use client";

import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Tooltip,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useMemo } from "react";
import { makeCurvedLinePoints } from "./useCurvedLine";

type LatLng = { lat: number; lng: number };

function isValid(p: LatLng | null | undefined) {
  return !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng);
}

export default function DeliveryRouteMap({
  pickup,
  dropoff,
  height = 240,
}: {
  pickup: LatLng | null;
  dropoff: LatLng | null;
  height?: number;
}) {
  const hasPickup = isValid(pickup);
  const hasDropoff = isValid(dropoff);

  const center: [number, number] = useMemo(() => {
    if (hasPickup && hasDropoff) {
      return [
        ((pickup as LatLng).lat + (dropoff as LatLng).lat) / 2,
        ((pickup as LatLng).lng + (dropoff as LatLng).lng) / 2,
      ];
    }
    if (hasPickup) return [(pickup as LatLng).lat, (pickup as LatLng).lng];
    if (hasDropoff)
      return [(dropoff as LatLng).lat, (dropoff as LatLng).lng];
    return [47.918, 106.917];
  }, [hasPickup, hasDropoff, pickup, dropoff]);

  const points = useMemo(() => {
    if (!hasPickup || !hasDropoff) return null;
    return makeCurvedLinePoints(pickup as LatLng, dropoff as LatLng, 32);
  }, [hasPickup, hasDropoff, pickup, dropoff]);

  // ✅ Padding-ийг томруулж, marker харагдахгүй болдог “хэт ойртох”-ыг засав
  const bounds = useMemo(() => {
    if (hasPickup && hasDropoff) {
      const p = pickup as LatLng;
      const d = dropoff as LatLng;

      const minLat = Math.min(p.lat, d.lat);
      const maxLat = Math.max(p.lat, d.lat);
      const minLng = Math.min(p.lng, d.lng);
      const maxLng = Math.max(p.lng, d.lng);

      // өмнөх 0.18 → 0.35 болгож “илүү холдуулав”
      const padLat = (maxLat - minLat) * 0.35 || 0.02;
      const padLng = (maxLng - minLng) * 0.35 || 0.02;

      return [
        [minLat - padLat, minLng - padLng],
        [maxLat + padLat, maxLng + padLng],
      ] as [[number, number], [number, number]];
    }

    const base = hasPickup
      ? (pickup as LatLng)
      : hasDropoff
      ? (dropoff as LatLng)
      : null;

    if (!base) return undefined;

    // 1 цэгтэй үед бага зэрэг холдуулах
    const padLat = 0.02;
    const padLng = 0.02;

    return [
      [base.lat - padLat, base.lng - padLng],
      [base.lat + padLat, base.lng + padLng],
    ] as [[number, number], [number, number]];
  }, [hasPickup, hasDropoff, pickup, dropoff]);

  return (
    <div style={{ height }}>
      <MapContainer
        center={center}
        zoom={12} // ✅ 13 → 12 (хэт ойртох багасгана)
        bounds={bounds}
        boundsOptions={{ padding: [36, 36] }} // ✅ marker харагдах орон зай
        scrollWheelZoom={false}
        minZoom={10}
        maxZoom={17}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {points && (
          <Polyline positions={points} pathOptions={{ weight: 4, opacity: 0.9 }} />
        )}

        {/* ✅ АВАХ: цэнхэр */}
        {hasPickup && (
          <CircleMarker
            center={[(pickup as LatLng).lat, (pickup as LatLng).lng]}
            radius={9}
            pathOptions={{ color: "#2563eb", weight: 3 }}
          >
            <Tooltip direction="top" offset={[0, -10]} opacity={1}>
              Авах
            </Tooltip>
          </CircleMarker>
        )}

        {/* ✅ ХҮРГЭХ: ногоон */}
        {hasDropoff && (
          <CircleMarker
            center={[(dropoff as LatLng).lat, (dropoff as LatLng).lng]}
            radius={9}
            pathOptions={{ color: "#16a34a", weight: 3 }}
          >
            <Tooltip direction="top" offset={[0, -10]} opacity={1}>
              Хүргэх
            </Tooltip>
          </CircleMarker>
        )}
      </MapContainer>
    </div>
  );
}
