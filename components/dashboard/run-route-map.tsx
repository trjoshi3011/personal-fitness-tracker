"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type Map as MlMap, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { decodePolyline, getRouteBounds } from "@/lib/strava-polyline";

type Props = {
  polyline: string;
};

type ThemeMode = "light" | "dark";

const ROUTE_SOURCE_ID = "lockin-run-route";
const ROUTE_LAYER_GLOW_ID = "lockin-run-route-glow";
const ROUTE_LAYER_LINE_ID = "lockin-run-route-line";

/* --- basemap styles -----------------------------------------------------
   Primary: MapTiler vector tile maps via MapLibre GL JS.
   Reference: https://docs.maptiler.com/maplibre/
              https://maplibre.org/maplibre-gl-js/docs/

   We use the `dataviz` style family because it's purpose-built to be a
   subtle background for data overlays (perfect for an Strava run line).
   Falls back to a Carto raster basemap if NEXT_PUBLIC_MAPTILER_API_KEY
   is not configured so the feature still works out of the box.        */

const MAPTILER_KEY =
  typeof process !== "undefined" ? process.env.NEXT_PUBLIC_MAPTILER_API_KEY : undefined;

function buildBasemapStyle(mode: ThemeMode): string | StyleSpecification {
  if (MAPTILER_KEY) {
    const styleId = mode === "dark" ? "dataviz-dark" : "dataviz-light";
    // MapLibre will load the JSON style from MapTiler directly.
    return `https://api.maptiler.com/maps/${styleId}/style.json?key=${MAPTILER_KEY}`;
  }

  // Fallback: Carto raster tiles (no API key required).
  const lightTiles = [
    "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
    "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
    "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
  ];
  const darkTiles = [
    "https://a.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png",
    "https://b.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png",
    "https://c.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png",
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

export default function RunRouteMap({ polyline }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  // Initialize synchronously — this component is dynamically imported with
  // ssr: false, so document is available on first render.
  const [mode, setMode] = useState<ThemeMode>(() => readMode());

  const points = useMemo(() => decodePolyline(polyline), [polyline]);
  const bounds = useMemo(() => getRouteBounds(points), [points]);
  const geojson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          geometry: {
            type: "LineString" as const,
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

  const startMarkerRef = useRef<maplibregl.Marker | null>(null);
  const endMarkerRef = useRef<maplibregl.Marker | null>(null);

  // Observe theme changes from the rest of the app.
  useEffect(() => {
    const obs = new MutationObserver(() => setMode(readMode()));
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-mode"],
    });
    return () => obs.disconnect();
  }, []);

  // Single effect to install / dispose the map. Uses the current `mode`
  // for the *initial* style only.
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

    const installRouteLayers = () => {
      const accent = readAccent();
      if (!map.getSource(ROUTE_SOURCE_ID)) {
        map.addSource(ROUTE_SOURCE_ID, { type: "geojson", data: geojson });
      } else {
        const src = map.getSource(ROUTE_SOURCE_ID);
        // Update geojson data on style swaps to be safe.
        if (src && "setData" in src) {
          (src as maplibregl.GeoJSONSource).setData(geojson);
        }
      }
      if (!map.getLayer(ROUTE_LAYER_GLOW_ID)) {
        map.addLayer({
          id: ROUTE_LAYER_GLOW_ID,
          type: "line",
          source: ROUTE_SOURCE_ID,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": accent,
            "line-width": 8,
            "line-opacity": 0.18,
            "line-blur": 6,
          },
        });
      } else {
        map.setPaintProperty(ROUTE_LAYER_GLOW_ID, "line-color", accent);
      }
      if (!map.getLayer(ROUTE_LAYER_LINE_ID)) {
        map.addLayer({
          id: ROUTE_LAYER_LINE_ID,
          type: "line",
          source: ROUTE_SOURCE_ID,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": accent,
            "line-width": 4,
            "line-opacity": 0.95,
          },
        });
      } else {
        map.setPaintProperty(ROUTE_LAYER_LINE_ID, "line-color", accent);
      }
    };

    map.on("load", () => {
      installRouteLayers();

      const startLng = points[0][1];
      const startLat = points[0][0];
      const endLng = points[points.length - 1][1];
      const endLat = points[points.length - 1][0];

      const startEl = document.createElement("div");
      startEl.style.cssText =
        "width:14px;height:14px;border-radius:9999px;background:#16a34a;border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,0.15)";
      startMarkerRef.current = new maplibregl.Marker({ element: startEl })
        .setLngLat([startLng, startLat])
        .setPopup(
          new maplibregl.Popup({ offset: 12, closeButton: false }).setText("Start"),
        )
        .addTo(map);

      const endEl = document.createElement("div");
      endEl.style.cssText =
        "width:14px;height:14px;border-radius:9999px;background:#dc2626;border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,0.15)";
      endMarkerRef.current = new maplibregl.Marker({ element: endEl })
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

    // After every style swap (mode change), reinstall the route layer.
    map.on("style.load", () => {
      // Skip the very first style.load — the "load" handler above already ran.
      if (!map.loaded()) return;
      installRouteLayers();
    });

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      startMarkerRef.current = null;
      endMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap basemap when mode changes — only when the new mode differs from
  // what the map is currently displaying. The "style.load" handler above
  // re-installs the route layer once the new style finishes loading.
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
    map.setStyle(buildBasemapStyle(mode));
  }, [mode]);

  // If the polyline changes or the route layers get dropped for any reason,
  // update (or re-install) the route overlay so the line doesn't disappear.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || points.length < 2 || !bounds) return;
    if (!map.isStyleLoaded()) return;

    const accent = readAccent();

    if (!map.getSource(ROUTE_SOURCE_ID)) {
      map.addSource(ROUTE_SOURCE_ID, { type: "geojson", data: geojson });
    } else {
      const src = map.getSource(ROUTE_SOURCE_ID);
      if (src && "setData" in src) {
        (src as maplibregl.GeoJSONSource).setData(geojson);
      }
    }

    if (!map.getLayer(ROUTE_LAYER_GLOW_ID)) {
      map.addLayer({
        id: ROUTE_LAYER_GLOW_ID,
        type: "line",
        source: ROUTE_SOURCE_ID,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": accent,
          "line-width": 8,
          "line-opacity": 0.18,
          "line-blur": 6,
        },
      });
    } else {
      map.setPaintProperty(ROUTE_LAYER_GLOW_ID, "line-color", accent);
    }
    if (!map.getLayer(ROUTE_LAYER_LINE_ID)) {
      map.addLayer({
        id: ROUTE_LAYER_LINE_ID,
        type: "line",
        source: ROUTE_SOURCE_ID,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": accent,
          "line-width": 4,
          "line-opacity": 0.95,
        },
      });
    } else {
      map.setPaintProperty(ROUTE_LAYER_LINE_ID, "line-color", accent);
    }

    const startLng = points[0][1];
    const startLat = points[0][0];
    const endLng = points[points.length - 1][1];
    const endLat = points[points.length - 1][0];
    startMarkerRef.current?.setLngLat([startLng, startLat]);
    endMarkerRef.current?.setLngLat([endLng, endLat]);

    map.fitBounds(
      [
        [bounds.minLng, bounds.minLat],
        [bounds.maxLng, bounds.maxLat],
      ],
      { padding: 28, duration: 0 },
    );
  }, [geojson, bounds, points]);

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
