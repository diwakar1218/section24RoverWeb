"use client";
import { notify } from "@/lib/notifications";
import { useEffect, useMemo, useRef, useState } from "react";
import { LocateFixed, MapPinned, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { googleMapId, googleMapsKey, loadGoogleMaps, observeMapAuthorizationFailure } from "@/lib/google-maps";
import { time } from "@/lib/utils";
import type { MobilePoint } from "@/types/mobile-surveys";

type MapPoint = { point: MobilePoint; label: string; track: boolean; position: google.maps.LatLngLiteral };
type Props = {
  points: MobilePoint[];
  track: MobilePoint[];
  polygon: boolean;
  fromId?: string;
  toId?: string;
  onSelect: (id: string) => void;
  onFromChange: (id: string) => void;
  onToChange: (id: string) => void;
};

function fitPoints(map: google.maps.Map, points: MapPoint[]) {
  if (!points.length) return;
  const first = points[0].position;
  if (points.every(p => p.position.lat === first.lat && p.position.lng === first.lng)) {
    map.setCenter(first);
    map.setZoom(20);
    return;
  }
  const bounds = new google.maps.LatLngBounds();
  points.forEach(p => bounds.extend(p.position));
  map.fitBounds(bounds, 65);
}

export default function SurveyMap({ points, track, polygon, fromId, toId, onSelect, onFromChange, onToChange }: Props) {
  const target = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const libraries = useRef<Awaited<ReturnType<typeof loadGoogleMaps>> | null>(null);
  const markers = useRef<{ marker: google.maps.marker.AdvancedMarkerElement; element: HTMLElement; id: string }[]>([]);
  const fitted = useRef("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if(error)notify(error); }, [error]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const select = useRef(onSelect);
  select.current = onSelect;
  const locations = useMemo<MapPoint[]>(() => [
    ...points.map((point, index) => ({ point, label: point.pointNumber || `P${index + 1}`, track: false })),
    ...track.map((point, index) => ({ point, label: point.pointNumber || `T${index + 1}`, track: true })),
  ].filter(({ point }) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
    && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180)
    .map(row => ({ ...row, position: { lat: row.point.latitude, lng: row.point.longitude } })), [points, track]);
  const selected = locations.find(p => p.point.id === selectedId);

  useEffect(() => {
    if (!googleMapsKey) return;
    let active = true;
    let instance: google.maps.Map | undefined;
    const stopAuth = observeMapAuthorizationFailure(() => {
      if (active) setError("Google Maps authorization failed. Check the browser Maps key and allowed website addresses.");
    });
    void loadGoogleMaps().then(loaded => {
      if (!active || !target.current) return;
      instance = new loaded.maps.Map(target.current, {
        center: { lat: 26.85, lng: 80.94 }, zoom: 5, mapId: googleMapId,
        mapTypeId: "roadmap", streetViewControl: false, fullscreenControl: true,
        mapTypeControl: true, zoomControl: true, gestureHandling: "greedy",
        mapTypeControlOptions: { position: google.maps.ControlPosition.TOP_LEFT },
        zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM },
      });
      map.current = instance;
      libraries.current = loaded;
      setReady(true);
      google.maps.event.addListenerOnce(instance, "idle", () => {
        if (active && target.current) target.current.dataset.rendered = "true";
      });
    }).catch(() => {
      if (active) setError("Google Maps could not load. Check your internet connection. The point diagram and saved coordinates are available below.");
    });
    return () => {
      active = false;
      stopAuth();
      if (instance) google.maps.event.clearInstanceListeners(instance);
      map.current = null;
      libraries.current = null;
      fitted.current = "";
    };
  }, []);

  useEffect(() => {
    const instance = map.current, loaded = libraries.current;
    if (!ready || !instance || !loaded) return;
    const created = locations.map(row => {
      const element = document.createElement("span");
      element.className = `survey-map-marker${row.track ? " track" : ""}`;
      element.textContent = row.label;
      element.dataset.pointId = row.point.id;
      const marker = new loaded.markers.AdvancedMarkerElement({
        map: instance, position: row.position, title: `Select ${row.label} on map`,
        gmpClickable: true, collisionBehavior: "REQUIRED", anchorTop: "-50%",
      });
      marker.append(element);
      marker.addEventListener("gmp-click", () => {
        setSelectedId(row.point.id);
        select.current(row.point.id);
      });
      return { marker, element, id: row.point.id };
    });
    markers.current = created;
    const vertices = locations.filter(p => !p.track).map(p => p.position);
    const trail = locations.filter(p => p.track).map(p => p.position);
    const shapes: (google.maps.Polygon | google.maps.Polyline)[] = [];
    if (polygon && vertices.length >= 3 && vertices.length === points.length) {
      shapes.push(new loaded.maps.Polygon({
        map: instance, paths: vertices, strokeColor: "#138168", strokeWeight: 3,
        fillColor: "#138168", fillOpacity: 0.18, clickable: false, geodesic: true,
      }));
    } else if (vertices.length > 1) {
      shapes.push(new loaded.maps.Polyline({
        map: instance, path: vertices, strokeColor: "#138168", strokeWeight: 3, clickable: false, geodesic: true,
      }));
    }
    if (trail.length > 1) shapes.push(new loaded.maps.Polyline({
      map: instance, path: trail, strokeColor: "#2873c9", strokeWeight: 3, clickable: false, geodesic: true,
    }));
    // Refreshing a saved record or selecting a point must preserve the user's zoom.
    const geometry = JSON.stringify(locations.map(p => [p.point.id, p.position.lat, p.position.lng]));
    if (geometry !== fitted.current && locations.length) {
      fitPoints(instance, locations);
      fitted.current = geometry;
    }
    return () => {
      created.forEach(({ marker }) => { marker.map = null; });
      shapes.forEach(shape => shape.setMap(null));
      markers.current = [];
    };
  }, [locations, points.length, polygon, ready]);

  useEffect(() => {
    const instance = map.current, loaded = libraries.current;
    if (!ready || !instance || !loaded) return;
    markers.current.forEach(({ marker, element, id }) => {
      element.classList.toggle("from", id === fromId);
      element.classList.toggle("to", id === toId);
      element.classList.toggle("selected", id === selectedId);
      marker.zIndex = id === selectedId ? 3 : id === fromId || id === toId ? 2 : 1;
    });
    const from = locations.find(p => p.point.id === fromId), to = locations.find(p => p.point.id === toId);
    if (!from || !to || from.point.id === to.point.id) return;
    const line = new loaded.maps.Polyline({
      map: instance, path: [from.position, to.position], geodesic: true, clickable: false,
      strokeOpacity: 0, zIndex: 2,
      icons: [{ icon: { path: "M 0,-1 0,1", strokeColor: "#d88829", strokeOpacity: 1, scale: 3 }, offset: "0", repeat: "12px" }],
    });
    return () => line.setMap(null);
  }, [fromId, toId, selectedId, locations, polygon, ready]);

  const unavailable = !googleMapsKey || !!error;
  const skipped = points.length + track.length - locations.length;
  return <div className="survey-history-map" role="region" aria-label="Saved survey map">
    <div className="survey-map-frame" hidden={unavailable}>
      <div ref={target} className="survey-map-canvas" aria-label="Google Maps saved survey points" />
      {!ready && <div className="survey-map-loading" role="status"><MapPinned size={25} />Loading survey map…</div>}
    </div>
    {unavailable ? <div className="survey-map-unavailable" role={error ? "alert" : "status"}><MapPinned size={24} /><p>{error || "Google Maps is not configured. The point diagram and saved coordinates are available below."}</p></div> : <div className="survey-map-toolbar">
      <div className="survey-map-legend"><span><i />{points.length} saved points</span>{track.length > 0 && <span><i className="track" />{track.length} track positions</span>}<span><i className="selection" />Selected distance</span></div>
      <Button size="sm" variant="outline" disabled={!ready || !locations.length} onClick={() => { if (map.current) fitPoints(map.current, locations); }}><LocateFixed size={15} />Fit all points</Button>
    </div>}
    {skipped > 0 && <p className="survey-map-notice" role="status">{skipped} saved positions have invalid coordinates and cannot be placed on the map.</p>}
    {selected && <section className="survey-map-point-details" aria-label="Selected map point" aria-live="polite">
      <div className="survey-map-point-heading"><div><span className="eyebrow">{selected.track ? "TRACK POSITION" : "SURVEY POINT"}</span><h3>{selected.label}{selected.point.name && <small>{selected.point.name}</small>}</h3></div><button type="button" aria-label="Close point details" onClick={() => setSelectedId(null)}><X size={17} /></button></div>
      <dl>
        {[
          ["Latitude", selected.point.latitude.toFixed(8)], ["Longitude", selected.point.longitude.toFixed(8)],
          ["Altitude", selected.point.altitude != null ? `${selected.point.altitude.toFixed(3)} m` : "Unavailable at capture"],
          ["H / V accuracy", `${selected.point.horizontalAccuracy?.toFixed(3) ?? "—"} / ${selected.point.verticalAccuracy?.toFixed(3) ?? "—"} m`],
          ["GNSS fix", selected.point.fixType || "Unavailable at capture"], ["Captured at", time(selected.point.capturedAt)],
          ["Address", selected.point.address || "Unavailable at capture"],
          ...(selected.point.remark ? [["Remark", selected.point.remark]] : []),
        ].map(([label, value]) => <div key={label} className={label === "Address" || label === "Remark" ? "wide" : ""}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
      <div className="survey-map-point-actions"><Button size="sm" variant="outline" onClick={() => onFromChange(selected.point.id)}>Use as from point</Button><Button size="sm" variant="outline" onClick={() => onToChange(selected.point.id)}>Use as to point</Button></div>
    </section>}
  </div>;
}
