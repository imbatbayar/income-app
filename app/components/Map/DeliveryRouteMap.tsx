"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Polyline, Marker, Tooltip, useMap } from "react-leaflet";

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
      user-select:none;
    ">${emoji}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

async function fetchOsrmRoute(pickup: LatLng, dropoff: LatLng) {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${pickup.lng},${pickup.lat};${dropoff.lng},${dropoff.lat}` +
    `?overview=full&geometries=geojson`;

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return null;

  const data = await res.json();
  const coords = data?.routes?.[0]?.geometry?.coordinates as [number, number][] | undefined;

  if (!coords?.length) return null;

  return coords.map(([lng, lat]) => [lat, lng] as [number, number]);
}

function FitToPath({
  pickup,
  dropoff,
  path,
  paddingPx = 100,
}: {
  pickup: LatLng | null;
  dropoff: LatLng | null;
  path: [number, number][] | null;
  paddingPx?: number;
}) {
  const map = useMap();
  const hasPickup = isValid(pickup);
  const hasDropoff = isValid(dropoff);

  function fitNow() {
    if (path && path.length >= 2) {
      const b = L.latLngBounds(path.map((p) => L.latLng(p[0], p[1])));
      map.fitBounds(b, {
        padding: [paddingPx, paddingPx],
        animate: true,
        duration: 0.35,
        maxZoom: 16,
      });
      return;
    }

    if (hasPickup && hasDropoff) {
      const p = pickup as LatLng;
      const d = dropoff as LatLng;
      const b = L.latLngBounds([p.lat, p.lng], [d.lat, d.lng]);
      map.fitBounds(b.pad(0.18), {
        padding: [paddingPx, paddingPx],
        animate: true,
        duration: 0.35,
        maxZoom: 16,
      });
      return;
    }

    if (hasPickup || hasDropoff) {
      const one = (hasPickup ? pickup : dropoff) as LatLng;
      map.setView([one.lat, one.lng], 14, { animate: true, duration: 0.3 });
    }
  }

  // popup/scale дотор төвлөрөл
  useEffect(() => {
    map.invalidateSize();
    fitNow();

    const t = setTimeout(() => {
      map.invalidateSize();
      fitNow();
    }, 80);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, pickup, dropoff, path, paddingPx]);

  // container хэмжээ өөрчлөгдөх үед дахин fit
  useEffect(() => {
    const el = map.getContainer();
    if (!el) return;

    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        map.invalidateSize();
        fitNow();
      });
    });

    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  return null;
}

export default function DeliveryRouteMap({
  pickup,
  dropoff,
  aspectRatio = "4 / 3",
  paddingPx = 100,
}: {
  pickup: LatLng | null;
  dropoff: LatLng | null;
  aspectRatio?: string;
  paddingPx?: number;
}) {
  const hasPickup = isValid(pickup);
  const hasDropoff = isValid(dropoff);

  const [routePath, setRoutePath] = useState<[number, number][] | null>(null);

  // ✅ Map instance-аа ref-ээр авна
  const mapRef = useRef<L.Map | null>(null);

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

  // route ирсний дараа resize хийх
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const t = setTimeout(() => m.invalidateSize(), 60);
    return () => clearTimeout(t);
  }, [routePath]);

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
    <div
      className="w-full max-w-full overflow-hidden"
      style={{ width: "100%", maxWidth: "100%", aspectRatio, display: "block" }}
    >
      <MapContainer
        center={center}
        zoom={12}
        scrollWheelZoom={false}
        minZoom={9}
        maxZoom={17}
        style={{ height: "100%", width: "100%", maxWidth: "100%" }}
        ref={mapRef as unknown as any}
        whenReady={() => {
          setTimeout(() => {
            mapRef.current?.invalidateSize();
          }, 0);
        }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors &copy; CARTO"
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          crossOrigin="anonymous"
        />

        <FitToPath pickup={pickup} dropoff={dropoff} path={routePath} paddingPx={paddingPx} />

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

        {hasPickup && (
          <Marker position={[(pickup as LatLng).lat, (pickup as LatLng).lng]} icon={emojiIcon("📦")}>
            <Tooltip direction="top" offset={[0, -18]} opacity={1}>
              Авах
            </Tooltip>
          </Marker>
        )}

        {hasDropoff && (
          <Marker position={[(dropoff as LatLng).lat, (dropoff as LatLng).lng]} icon={emojiIcon("👋")}>
            <Tooltip direction="top" offset={[0, -18]} opacity={1}>
              Хүргэх
            </Tooltip>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}
