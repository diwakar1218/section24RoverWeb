"use client";
import { notify } from "@/lib/notifications";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, LocateFixed, X } from "lucide-react";
import { useAuth } from "@/components/providers";
import { googleMapId, googleMapsKey, loadGoogleMaps, loadGoogleGeocoder, observeMapAuthorizationFailure } from "@/lib/google-maps";
import { roverActivity, workDuration } from "@/lib/rover-activity";
import type { RoverView } from "@/types";
import { time } from "@/lib/utils";
const colors = { Active: "#138168", Inactive: "#d13c4a", Unknown: "#8994a2" };
const addresses=new Map<string,string>();
function position(r: RoverView) {
  const lat = r.data.latitude, lng = r.data.longitude;
  return lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}
function fitRovers(map: google.maps.Map, rovers: RoverView[]) {
  const points = rovers.map(position).filter((p): p is google.maps.LatLngLiteral => p !== null);
  if (!points.length) return;
  if (points.length === 1) { map.setCenter(points[0]); map.setZoom(13); return; }
  const bounds = new google.maps.LatLngBounds();
  points.forEach(p => bounds.extend(p));
  map.fitBounds(bounds, 65);
  google.maps.event.addListenerOnce(map, "idle", () => {
    if ((map.getZoom() ?? 0) > 15) map.setZoom(15);
  });
}
export default function RoverMap({ rovers, focusedId }: { rovers: RoverView[]; focusedId?: string }) {
  const pathname = usePathname();
  const { profile } = useAuth();
  const target = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const markerLibrary = useRef<google.maps.MarkerLibrary | null>(null);
  const fitted = useRef(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if(error)notify(error); }, [error]);
  const [selected, setSelected] = useState<string | null>(null);
  const [locationAddress,setLocationAddress]=useState<{key:string;value:string}|null>(null);
  const lastLookup=useRef<{rover:string;at:number}>({rover:"",at:0});
  const latest = useRef(rovers);
  latest.current = rovers;
  useEffect(() => {
    if (!googleMapsKey) return;
    let active = true;
    let instance: google.maps.Map | undefined;
    const stopAuth = observeMapAuthorizationFailure(() => {
      if (active) setError("Google Maps authorization failed. Check API enablement, billing, and allowed website addresses.");
    });
    void loadGoogleMaps().then(({ maps, markers }) => {
      if (!active || !target.current) return;
      instance = new maps.Map(target.current, {
        center: { lat: 22.5, lng: 79 }, zoom: 5, mapId: googleMapId,
        mapTypeId: "roadmap", streetViewControl: false, fullscreenControl: false,
        mapTypeControlOptions: { position: google.maps.ControlPosition.TOP_RIGHT },
        zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM },
        gestureHandling: "greedy",
      });
      map.current = instance;
      markerLibrary.current = markers;
      setReady(true);
      google.maps.event.addListenerOnce(instance, "idle", () => {
        if (active && target.current) target.current.dataset.rendered = "true";
      });
    }).catch(() => {
      if (active) setError("Google Maps could not load. Check your internet connection and Google Maps configuration.");
    });
    return () => {
      active = false;
      stopAuth();
      if (instance) google.maps.event.clearInstanceListeners(instance);
      map.current = null;
      markerLibrary.current = null;
      fitted.current = false;
    };
  }, []);
  useEffect(() => {
    const instance = map.current, library = markerLibrary.current;
    if (!ready || !instance || !library) return;
    const markers: google.maps.marker.AdvancedMarkerElement[] = [];
    for (const r of rovers) {
      const point = position(r);
      if (!point) continue;
      const dot = document.createElement("div");
      dot.className = "google-rover-marker";
      const activity=roverActivity(r);
      dot.classList.add(activity.active?"active":activity.unknown?"unknown":"inactive");
      dot.dataset.roverId=r.data.id;
      dot.dataset.activity=activity.active?"active":activity.unknown?"unknown":"inactive";
      dot.style.backgroundColor = activity.active?colors.Active:activity.unknown?colors.Unknown:colors.Inactive;
      if (r.data.id === (selected ?? focusedId)) dot.classList.add("focused");
      const marker = new library.AdvancedMarkerElement({
        map: instance, position: point, content: dot,
        title: `${r.data.name} — ${r.connectionStatus}`, zIndex: r.data.id === (selected ?? focusedId) ? 2 : 1,
      });
      marker.addListener("click", () => setSelected(r.data.id));
      markers.push(marker);
    }
    if (!fitted.current && markers.length) {
      fitRovers(instance, rovers);
      fitted.current = true;
    }
    return () => markers.forEach(marker => {
      google.maps.event.clearInstanceListeners(marker);
      marker.map = null;
    });
  }, [rovers, ready, focusedId, selected]);
  useEffect(() => {
    const r = latest.current.find(r => r.data.id === focusedId);
    const point = r && position(r);
    if (ready && map.current && point) {
      map.current.panTo(point);
      map.current.setZoom(13);
      setSelected(r!.data.id);
    }
  }, [focusedId, ready]);
  const rover = rovers.find(r => r.data.id === selected);
  const point=rover&&position(rover);
  const addressKey=point?`${point.lat.toFixed(4)},${point.lng.toFixed(4)}`:"";
  const selectedId=rover?.data.id??"";
  useEffect(()=>{
    if(!selectedId||!point||!googleMapsKey)return;
    if(addresses.has(addressKey)){setLocationAddress({key:addressKey,value:addresses.get(addressKey)!});return;}
    let active=true;
    const delay=lastLookup.current.rover===selectedId?Math.max(0,60000-(Date.now()-lastLookup.current.at)):0;
    const timer=setTimeout(()=>{
      lastLookup.current={rover:selectedId,at:Date.now()};
      void loadGoogleGeocoder().then(geocoder=>geocoder.geocode({location:point,region:"IN"})).then(result=>{
        const value=result.results[0]?.formatted_address;
        if(value){addresses.set(addressKey,value);if(addresses.size>128)addresses.delete(addresses.keys().next().value!);if(active)setLocationAddress({key:addressKey,value});}
      }).catch(()=>{if(active)notify("Address lookup is unavailable. Recorded address and coordinates are still shown.","warning","rover-geocoding",30000);});
    },delay);
    return()=>{active=false;clearTimeout(timer);};
  // Rounded coordinates avoid repeated lookups for normal receiver jitter.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[selectedId,addressKey]);
  const activity=rover?roverActivity(rover):null;
  const receiverHref = rover ? `/dashboard/rovers/${encodeURIComponent(rover.data.id)}` : null;
  const viewingReceiver = pathname === receiverHref;
  const canReadSurveys = profile?.grants.some(g => g.permission === "surveys.read");
  const detailsHref = viewingReceiver
    ? rover?.data.jobId && canReadSurveys
      ? `/dashboard/${rover.data.source === "android" ? "mobile-surveys" : "surveys"}/${encodeURIComponent(rover.data.jobId)}`
      : null
    : receiverHref;
  function recenter() {
    if (map.current) fitRovers(map.current, latest.current);
  }
  return (
    <div className="map-container">
      <div
        ref={target}
        className="map-canvas"
        aria-label="Google Maps rover locations"
      />
      {!googleMapsKey && rovers.some(r => position(r)) ? <div className="map-coordinate-board" aria-label="Last reported rover coordinates"><strong>Rover coordinate overview</strong><p>WGS84 positions · {rovers.filter(r=>position(r)).length} connections</p>{rovers.filter(r=>position(r)).map(r=><button key={r.data.id} onClick={()=>setSelected(r.data.id)}><span><strong>{r.data.name}</strong><small>{r.data.surveyorName} · {r.data.village || r.data.district}</small></span><span>{r.data.latitude!.toFixed(8)}, {r.data.longitude!.toFixed(8)}<small>{r.connectionStatus} · {time(r.data.observedAt)}</small></span></button>)}</div> : (!googleMapsKey || error || !ready) && (
        <div className="map-unavailable" role={error ? "alert" : "status"}>
          <LocateFixed size={28} />
          <strong>{error ? "Google Maps unavailable" : googleMapsKey ? "Loading Google Maps…" : "Map view is optional"}</strong>
          <p>{error || (googleMapsKey ? "Preparing your field map." : "Google Maps is not enabled yet. Device status, coordinates, and survey records are still available in the dashboard.")}</p>
        </div>
      )}
      <div className="map-top-label">
        <span className="dot green" /> FIELD OPERATIONS <span>EPSG:4326</span>
      </div>
      <button
        className="map-recenter"
        title="Fit all rovers"
        aria-label="Fit all rovers"
        disabled={!ready || !!error || !rovers.some(r => position(r))}
        onClick={recenter}
      >
        <LocateFixed size={18} />
      </button>
      {rover && (
        <div className="map-popup">
          <button
            className="popup-close"
            aria-label="Close rover popup"
            onClick={() => setSelected(null)}
          >
            <X size={15} />
          </button>
          <span className="eyebrow">{rover.data.serialNumber}</span>
          <h4>
            {rover.data.name}
            <span className={`badge ${rover.connectionStatus.toLowerCase()}`}>
              {rover.connectionStatus}
            </span>
          </h4>
          <p>{rover.data.surveyorName ?? "Unassigned surveyor"}</p>
          <div className="rover-popup-address"><strong>{locationAddress?.key===addressKey?"Location address":"Recorded address"}</strong><p>{locationAddress?.key===addressKey?locationAddress.value:rover.data.address||[rover.data.village,rover.data.tehsil,rover.data.district].filter(v=>v&&v!=="Not selected").join(", ")||"Address not available"}</p>
            {point&&<small>{point.lat.toFixed(8)}, {point.lng.toFixed(8)}</small>}
          </div>
          <dl>
            <dt>Activity</dt><dd className={activity?.active?"rover-active-text":activity?.unknown?"":"rover-inactive-text"}>{activity?.active?"Active":activity?.unknown?"Not reported":"Inactive"}</dd>
            {activity?.active&&activity.activeSince&&<><dt>Active since</dt><dd>{time(activity.activeSince)}</dd></>}
            <dt>Last active</dt><dd>{activity?.lastActiveAt?time(activity.lastActiveAt):"Not recorded"}</dd>
            {!activity?.active&&<><dt>Inactive since</dt><dd>{activity?.inactiveSince?time(activity.inactiveSince):"Not recorded"}</dd></>}
            {!activity?.active&&activity?.inactiveSince&&<><dt>Inactive for</dt><dd>{workDuration((Date.now()-Date.parse(activity.inactiveSince))/1000)}</dd></>}
            <dt>GNSS fix</dt>
            <dd>{rover.data.fixType ?? "Unavailable"}</dd>
            <dt>Horizontal precision</dt>
            <dd>
              {rover.data.horizontalPrecision != null
                ? `${(rover.data.horizontalPrecision * 100).toFixed(1)} cm`
                : "Unavailable"}
            </dd>
            <dt>Observed at</dt>
            <dd>{time(rover.data.observedAt)}</dd>
          </dl>
          {detailsHref && <Link href={detailsHref}>
            {viewingReceiver ? "View survey details" : "View full details"} <ArrowUpRight size={15} />
          </Link>}
        </div>
      )}
      <div className="map-legend">
        <span>
          <i className="active-rover-legend" style={{ background: colors.Active }} />
          Active
        </span>
        <span>
          <i style={{ background: colors.Inactive }} />
          Inactive
        </span>
        <span>
          <i style={{ background: colors.Unknown }} />
          Not reported
        </span>
        <span className="legend-note">Last known locations</span>
      </div>
    </div>
  );
}
