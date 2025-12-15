"use client";

import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useMemo } from "react";
import { makeCurvedLinePoints } from "./useCurvedLine";

type LatLng = { lat: number; lng: number };

export default function DeliveryRouteMap({
  pickup,
  dropoff,
  height = 240,
}: {
  pickup: LatLng;
  dropoff: LatLng;
  height?: number;
}) {
  const points = useMemo(() => makeCurvedLinePoints(pickup, dropoff, 32), [pickup, dropoff]);

  const center: [number, number] = [(pickup.lat + dropoff.lat) / 2, (pickup.lng + dropoff.lng) / 2];

  const bounds = useMemo(() => {
    const minLat = Math.min(pickup.lat, dropoff.lat);
    const maxLat = Math.max(pickup.lat, dropoff.lat);
    const minLng = Math.min(pickup.lng, dropoff.lng);
    const maxLng = Math.max(pickup.lng, dropoff.lng);

    const padLat = (maxLat - minLat) * 0.18 || 0.01;
    const padLng = (maxLng - minLng) * 0.18 || 0.01;

    return [
      [minLat - padLat, minLng - padLng],
      [maxLat + padLat, maxLng + padLng],
    ] as [[number, number], [number, number]];
  }, [pickup, dropoff]);

  return (
    <div style={{ height }}>
      <MapContainer
        center={center}
        zoom={13}
        bounds={bounds}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <Polyline positions={points} pathOptions={{ weight: 4, opacity: 0.9 }} />

        <CircleMarker center={[pickup.lat, pickup.lng]} radius={8} pathOptions={{ color: "#16a34a", weight: 3 }}>
          <Tooltip direction="top" offset={[0, -10]} opacity={1}>
            Авах
          </Tooltip>
        </CircleMarker>

        <CircleMarker center={[dropoff.lat, dropoff.lng]} radius={8} pathOptions={{ color: "#dc2626", weight: 3 }}>
          <Tooltip direction="top" offset={[0, -10]} opacity={1}>
            Хүргэх
          </Tooltip>
        </CircleMarker>
      </MapContainer>
    </div>
  );
}
