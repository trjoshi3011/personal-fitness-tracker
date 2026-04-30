"use client";

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { decodePolyline, getRouteBounds } from "@/lib/strava-polyline";

type Props = {
  polyline: string;
};

export default function RunRouteMap({ polyline }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  const points = useMemo(() => decodePolyline(polyline), [polyline]);
  const bounds = useMemo(() => getRouteBounds(points), [points]);

  useEffect(() => {
    if (!containerRef.current || points.length < 2 || !bounds) return;

    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: false,
    });
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    const latLngs = points.map(([lat, lng]) => L.latLng(lat, lng));

    L.polyline(latLngs, {
      color: "#dc2626",
      weight: 4,
      opacity: 0.95,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(map);

    const start = latLngs[0];
    const end = latLngs[latLngs.length - 1];
    L.circleMarker(start, {
      radius: 6,
      fillColor: "#16a34a",
      color: "#ffffff",
      weight: 2,
      fillOpacity: 1,
    })
      .bindTooltip("Start", { direction: "top", offset: [0, -6] })
      .addTo(map);
    L.circleMarker(end, {
      radius: 6,
      fillColor: "#dc2626",
      color: "#ffffff",
      weight: 2,
      fillOpacity: 1,
    })
      .bindTooltip("End", { direction: "top", offset: [0, -6] })
      .addTo(map);

    map.fitBounds(
      L.latLngBounds(L.latLng(bounds.minLat, bounds.minLng), L.latLng(bounds.maxLat, bounds.maxLng)),
      { padding: [20, 20] },
    );

    // Re-size after layout settles (panel just expanded).
    const ro = new ResizeObserver(() => {
      map.invalidateSize();
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [points, bounds]);

  if (points.length < 2 || !bounds) {
    return (
      <p className="text-sm text-stone-500">
        Route information is not available for this run.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h4 className="text-xs font-semibold tracking-wider text-stone-600 uppercase">
          Route
        </h4>
        <span className="text-[10px] text-stone-500">{points.length} GPS pts</span>
      </div>
      <div
        ref={containerRef}
        className="h-[320px] w-full overflow-hidden rounded-xl border border-[color:var(--color-border-subtle)]"
      />
    </div>
  );
}
