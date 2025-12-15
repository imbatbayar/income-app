// app/components/Map/useCurvedLine.ts
// 2 цэгийн хооронд "зам шиг" харагдах нум (curved polyline) үүсгэнэ.
// ⚠️ Routing БИШ — зөвхөн чиглэлийн preview дүрслэл.

type LatLng = { lat: number; lng: number };

export function makeCurvedLinePoints(a: LatLng, b: LatLng, segments = 24): [number, number][] {
  // Midpoint
  const mid = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };

  // Vector from a -> b
  const dx = b.lng - a.lng;
  const dy = b.lat - a.lat;

  // Distance (rough)
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Perpendicular offset (tunable)
  // dist ихсэх тусам бага зэрэг илүү нум гарна, гэхдээ хэт "сэрвийхгүй"
  const k = Math.min(0.25, Math.max(0.08, dist * 0.35));

  // Perpendicular vector (-dx, dy)
  const ctrl = {
    lat: mid.lat + -dx * k,
    lng: mid.lng + dy * k,
  };

  const pts: [number, number][] = [];
  const n = Math.max(8, Math.min(80, segments));

  for (let i = 0; i <= n; i++) {
    const t = i / n;

    // Quadratic Bezier:
    // P(t) = (1-t)^2 A + 2(1-t)t C + t^2 B
    const one = 1 - t;

    const lat = one * one * a.lat + 2 * one * t * ctrl.lat + t * t * b.lat;
    const lng = one * one * a.lng + 2 * one * t * ctrl.lng + t * t * b.lng;

    pts.push([lat, lng]);
  }

  return pts;
}
