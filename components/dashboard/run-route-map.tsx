"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type Map as MlMap, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { decodePolyline, getRouteBounds } from "@/lib/strava-polyline";

type Props = {
  polyline: string;
};

type ThemeMode = "light" | "dark";

/* --- basemap styles -----------------------------------------------------
   Primary: MapTiler vector tile maps via MapLibre GL JS.
   Reference: https://docs.maptiler.com/maplibre/
              https://maplibre.org/maplibre-gl-js/docs/

   Light: `dataviz-light` — clean, neutral, optimized for data overlays.
   Dark : `streets-v2-dark` — a softer charcoal grey (lighter than
          `dataviz-dark`) so the route + UI stay readable.
   Falls back to a Carto raster basemap if NEXT_PUBLIC_MAPTILER_API_KEY
   is not configured so the feature still works out of the box.        */

const MAPTILER_KEY =
  typeof process !== "undefined" ? process.env.NEXT_PUBLIC_MAPTILER_API_KEY : undefined;

function buildBasemapStyle(mode: ThemeMode): string | StyleSpecification {
  if (MAPTILER_KEY) {
    const styleId = mode === "dark" ? "streets-v2-dark" : "dataviz-light";
    return `https://api.maptiler.com/maps/${styleId}/style.json?key=${MAPTILER_KEY}`;
  }

  // Fallback: Carto raster tiles (no API key required).
  const lightTiles = [
    "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
    "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
    "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
  ];
  const darkTiles = [
    // Carto's `dark_nolabels` is a touch lighter than `dark_all`.
    "https://a.basemaps.cartocdn.com/rastertiles/dark_nolabels/{z}/{x}/{y}.png",
    "https://b.basemaps.cartocdn.com/rastertiles/dark_nolabels/{z}/{x}/{y}.png",
    "https://c.basemaps.cartocdn.com/rastertiles/dark_nolabels/{z}/{x}/{y}.png",
  ];
  const tiles = mode === "dark" ? darkTiles : lightTiles;
  return {
    version: 8,
    sources: {
      basemap: {
        type: "raster",
        tiles,
        tileSize: 256,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>',
      },
    },
    layers: [
      { id: "basemap", type: "raster", source: "basemap", minzoom: 0, maxzoom: 22 },
    ],
  };
}

function readMode(): ThemeMode {
  if (typeof document === "undefined") return "light";
  return document.documentElement.getAttribute("data-mode") === "dark"
    ? "dark"
    : "light";
}

function readAccent(): string {
  if (typeof document === "undefined") return "#dc2626";
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue("--ui-accent")
    .trim();
  return v || "#dc2626";
}

type RouteFC = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "LineString"; coordinates: [number, number][] };
    properties: Record<string, unknown>;
  }>;
};

/**
 * Idempotent installer that adds the route source + glow + line layers,
 * or updates them if they already exist. Always uses the latest geojson
 * and accent color from the closures' refs.
 */
function installRouteLayers(map: MlMap, geojson: RouteFC, accent: string) {
  const src = map.getSource("route") as maplibregl.GeoJSONSource | undefined;
  if (!src) {
    map.addSource("route", { type: "geojson", data: geojson });
  } else {
    src.setData(geojson);
  }
  if (!map.getLayer("route-glow")) {
    map.addLayer({
      id: "route-glow",
      type: "line",
      source: "route",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": accent,
        "line-width": 8,
        "line-opacity": 0.18,
        "line-blur": 6,
      },
    });
  } else {
    map.setPaintProperty("route-glow", "line-color", accent);
  }
  if (!map.getLayer("route-line")) {
    map.addLayer({
      id: "route-line",
      type: "line",
      source: "route",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": accent,
        "line-width": 4,
        "line-opacity": 0.95,
      },
    });
  } else {
    map.setPaintProperty("route-line", "line-color", accent);
  }
}

export default function RunRouteMap({ polyline }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  // Read the initial mode synchronously — the component is dynamic({ ssr: false })
  const [mode, setMode] = useState<ThemeMode>(() => readMode());

  const points = useMemo(() => decodePolyline(polyline), [polyline]);
  const bounds = useMemo(() => getRouteBounds(points), [points]);
  const geojson = useMemo<RouteFC>(
    () => ({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: points.map(
              ([lat, lng]) => [lng, lat] as [number, number],
            ),
          },
          properties: {},
        },
      ],
    }),
    [points],
  );

  // Refs that always hold the latest values. Used by event handlers that
  // were registered once during the initial map setup.
  const geojsonRef = useRef(geojson);
  useEffect(() => {
    geojsonRef.current = geojson;
    // If the map is already live and the route data changed, push the new
    // data to the existing source.
    const map = mapRef.current;
    if (map && map.getSource("route")) {
      const src = map.getSource("route") as maplibregl.GeoJSONSource;
      src.setData(geojson);
    }
  }, [geojson]);

  // Watch theme changes from the rest of the app.
  useEffect(() => {
    const obs = new MutationObserver(() => setMode(readMode()));
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-mode"],
    });
    return () => obs.disconnect();
  }, []);

  // Single effect to create / dispose the map.
  useEffect(() => {
    if (!containerRef.current || points.length < 2 || !bounds) return;
    if (mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildBasemapStyle(readMode()),
      attributionControl: { compact: true },
      cooperativeGestures: false,
      scrollZoom: false,
      pitchWithRotate: false,
      dragRotate: false,
      touchZoomRotate: true,
    });
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-left",
    );
    mapRef.current = map;

    map.on("load", () => {
      installRouteLayers(map, geojsonRef.current, readAccent());

      const startLng = points[0][1];
      const startLat = points[0][0];
      const endLng = points[points.length - 1][1];
      const endLat = points[points.length - 1][0];

      const startEl = document.createElement("div");
      startEl.style.cssText =
        "width:14px;height:14px;border-radius:9999px;background:#16a34a;border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,0.15)";
      new maplibregl.Marker({ element: startEl })
        .setLngLat([startLng, startLat])
        .setPopup(
          new maplibregl.Popup({ offset: 12, closeButton: false }).setText("Start"),
        )
        .addTo(map);

      const endEl = document.createElement("div");
      endEl.style.cssText =
        "width:14px;height:14px;border-radius:9999px;background:#dc2626;border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,0.15)";
      new maplibregl.Marker({ element: endEl })
        .setLngLat([endLng, endLat])
        .setPopup(
          new maplibregl.Popup({ offset: 12, closeButton: false }).setText("End"),
        )
        .addTo(map);

      map.fitBounds(
        [
          [bounds.minLng, bounds.minLat],
          [bounds.maxLng, bounds.maxLat],
        ],
        { padding: 28, duration: 0 },
      );
    });

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap basemap when mode changes, then re-install the route on the new
  // style. We use `once("style.load")` per swap so we never miss the event
  // and the layers are always re-added — fixes the "route disappears when
  // toggling dark/light" bug.
  const lastModeRef = useRef<ThemeMode | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      lastModeRef.current = mode;
      return;
    }
    if (lastModeRef.current === null) {
      lastModeRef.current = mode;
      return;
    }
    if (lastModeRef.current === mode) return;
    lastModeRef.current = mode;

    const reinstall = () => {
      installRouteLayers(map, geojsonRef.current, readAccent());
    };
    map.once("style.load", reinstall);
    // Safety net: in some MapLibre versions `style.load` doesn't fire if
    // the diff path was used. `idle` always fires once the map settles.
    map.once("idle", reinstall);

    map.setStyle(buildBasemapStyle(mode));
  }, [mode]);

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
        className="run-route-map h-[320px] w-full overflow-hidden rounded-xl border border-[color:var(--color-border-subtle)]"
      />
    </div>
  );
}
