'use client';
import { useEffect, useState } from 'react';
import { divIcon } from 'leaflet';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';

type Location = { latitude: number; longitude: number };

function PinSetter({ onChange }: { onChange: (location: Location) => void }) {
  useMapEvents({ click: event => onChange({ latitude: event.latlng.lat, longitude: event.latlng.lng }) });
  return null;
}
function FocusLocation({ location }: { location: [number, number] | null }) {
  const map = useMap();
  const latitude = location?.[0];
  const longitude = location?.[1];
  useEffect(() => {
    if (latitude !== undefined && longitude !== undefined) map.flyTo([latitude, longitude], 16);
  }, [latitude, longitude, map]);
  return null;
}

export default function AddressVerification({ address, city, latitude, longitude, onChange }: {
  address: string; city: string; latitude: number | null; longitude: number | null; onChange: (location: Location | null) => void;
}) {
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [showMap, setShowMap] = useState(latitude !== null && longitude !== null);
  const verify = async () => {
    if (!address.trim() || !city.trim()) { setError('יש למלא כתובת ועיר לפני האימות.'); return; }
    setChecking(true); setError('');
    try {
      const response = await fetch('/api/address-lookup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address, city }) });
      if (!response.ok) throw new Error();
      const point = await response.json() as { lat: number; lng: number };
      onChange({ latitude: point.lat, longitude: point.lng }); setShowMap(true);
    } catch { onChange(null); setShowMap(true); setError('לא הצלחנו לאתר את הכתובת. לחצו על המיקום הנכון במפה.'); }
    finally { setChecking(false); }
  };
  const location = latitude !== null && longitude !== null ? [latitude, longitude] as [number, number] : null;
  return <div className="address-verification full">
    <div className="verification-row"><button className="btn" type="button" disabled={checking} onClick={verify}>{checking ? 'בודק כתובת…' : location ? 'אימות מחדש' : 'אימות כתובת במפה'}</button>{location && <span className="verified-address">✓ המיקום אומת</span>}</div>
    {error && <p className="field-error" role="alert">{error}</p>}
    {showMap && <><p className="map-pin-help">{location ? 'ודאו שהסיכה נמצאת במקום הנכון. אפשר ללחוץ במפה כדי להזיז אותה.' : 'לחצו במפה כדי לסמן את המיקום המדויק.'}</p><MapContainer className="address-picker-map" center={location ?? [31.75, 34.9]} zoom={location ? 16 : 7} scrollWheelZoom>
      <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <FocusLocation location={location} />
      <PinSetter onChange={next => { onChange(next); setError(''); }} />
      {location && <Marker position={location} icon={divIcon({ className: 'route-marker-shell', html: '<span class="route-marker">✓</span>', iconSize: [30, 30], iconAnchor: [15, 15] })} />}
    </MapContainer></>}
  </div>;
}
