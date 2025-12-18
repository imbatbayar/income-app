"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  Tooltip,
  useMap,
} from "react-leaflet";

type LatLng = { lat: number; lng: number };

function isValid(p: LatLng | null | undefined) {
  return !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng);
}

function emojiIcon(emoji: string) {
  return L.divIcon({
    className: "",
    html: `<div style="
      font-size:28px;
      line-height:28px;
      transform: translate(-50%, -50%);
      filter: drop-shadow(0 2px 8px rgba(0,0,0,.22));
    ">${emoji}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

// ✅ OSRM route (жинхэнэ зам)
async function fetchOsrmRoute(pickup: LatLng, dropoff: LatLng) {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${pickup.lng},${pickup.lat};${dropoff.lng},${dropoff.lat}` +
    `?overview=full&geometries=geojson`;

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return null;

  const data = await res.json();
  const coords = data?.routes?.[0]?.geometry?.coordinates as
    | [number, number][]
    | undefined;

  if (!coords?.length) return null;

  // geojson: [lng, lat] -> leaflet: [lat, lng]
  return coords.map(([lng, lat]) => [lat, lng] as [number, number]);
}

// ✅ Route/Points дээр fit хийх layer
function FitToPath({
  pickup,
  dropoff,
  path,
}: {
  pickup: LatLng | null;
  dropoff: LatLng | null;
  path: [number, number][] | null;
}) {
  const map = useMap();
  const hasPickup = isValid(pickup);
  const hasDropoff = isValid(dropoff);

  useEffect(() => {
    // 1) Route байвал route-аа дүүргэж fit
    if (path && path.length >= 2) {
      const b = L.latLngBounds(path.map((p) => L.latLng(p[0], p[1])));
      map.fitBounds(b.pad(0.18), {
        padding: [36, 36], // 1:1 дээр их padding хэрэггүй
        animate: true,
        duration: 0.35,
        maxZoom: 16,
      });
      return;
    }

    // 2) Route байхгүй үед endpoints дээр fit (fallback)
    if (hasPickup && hasDropoff) {
      const p = pickup as LatLng;
      const d = dropoff as LatLng;
      const b = L.latLngBounds([p.lat, p.lng], [d.lat, d.lng]);
      map.fitBounds(b.pad(0.35), {
        padding: [48, 48],
        animate: true,
        duration: 0.35,
        maxZoom: 16,
      });
      return;
    }

    // 3) 1 цэгтэй үед томруулж төвлөрүүлнэ
    if (hasPickup || hasDropoff) {
      const one = (hasPickup ? pickup : dropoff) as LatLng;
      map.setView([one.lat, one.lng], 14, { animate: true, duration: 0.3 });
    }
  }, [map, hasPickup, hasDropoff, pickup, dropoff, path]);

  return null;
}

export default function DeliveryRouteMap({
  pickup,
  dropoff,
}: {
  pickup: LatLng | null;
  dropoff: LatLng | null;
}) {
  const hasPickup = isValid(pickup);
  const hasDropoff = isValid(dropoff);

  const [routePath, setRoutePath] = useState<[number, number][] | null>(null);

  // ✅ 2 цэг байвал OSRM route татна
  useEffect(() => {
    let cancelled = false;

    async function run() {
      setRoutePath(null);
      if (!hasPickup || !hasDropoff) return;

      const p = pickup as LatLng;
      const d = dropoff as LatLng;

      try {
        const path = await fetchOsrmRoute(p, d);
        if (!cancelled) setRoutePath(path);
      } catch {
        if (!cancelled) setRoutePath(null);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [hasPickup, hasDropoff, pickup, dropoff]);

  const center: [number, number] = useMemo(() => {
    if (hasPickup && hasDropoff) {
      return [
        ((pickup as LatLng).lat + (dropoff as LatLng).lat) / 2,
        ((pickup as LatLng).lng + (dropoff as LatLng).lng) / 2,
      ];
    }
    if (hasPickup) return [(pickup as LatLng).lat, (pickup as LatLng).lng];
    if (hasDropoff) return [(dropoff as LatLng).lat, (dropoff as LatLng).lng];
    return [47.918, 106.917];
  }, [hasPickup, hasDropoff, pickup, dropoff]);

  return (
    // ✅ 1:1 (square)
    <div style={{ width: "100%", aspectRatio: "4 / 3" }}>
      <MapContainer
        center={center}
        zoom={12}
        scrollWheelZoom={false}
        minZoom={9}
        maxZoom={17}
        style={{ height: "100%", width: "100%" }}
      >
        {/* ✅ Чи хүссэн “гоё өнгө” */}
        <TileLayer
          attribution="&copy; OpenStreetMap contributors &copy; CARTO"
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />

        <FitToPath pickup={pickup} dropoff={dropoff} path={routePath} />

        {/* ✅ Жинхэнэ зам (route) */}
        {routePath && routePath.length >= 2 && (
          <Polyline
            positions={routePath}
            pathOptions={{
              color: "#111827",
              weight: 5,
              opacity: 0.95,
              lineCap: "round",
              lineJoin: "round",
            }}
          />
        )}

        {/* 📦 АВАХ */}
        {hasPickup && (
          <Marker
            position={[(pickup as LatLng).lat, (pickup as LatLng).lng]}
            icon={emojiIcon("📦")}
          >
            <Tooltip direction="top" offset={[0, -18]} opacity={1}>
              Авах
            </Tooltip>
          </Marker>
        )}

        {/* 👋 ХҮРГЭХ */}
        {hasDropoff && (
          <Marker
            position={[(dropoff as LatLng).lat, (dropoff as LatLng).lng]}
            icon={emojiIcon("👋")}
          >
            <Tooltip direction="top" offset={[0, -18]} opacity={1}>
              Хүргэх
            </Tooltip>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}
