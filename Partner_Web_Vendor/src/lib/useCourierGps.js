// useCourierGps — while the courier is on duty, watch the device GPS and
// post fixes to POST /api/driver/location. The server fans each fix out
// to the admin fleet map, the vendor awaiting pickup, and the customer
// whose order is out for delivery (see server/src/lib/tracking.js).
//
// Sends at most one fix every SEND_EVERY_MS, or sooner when the courier
// moved more than MOVE_M metres. Works in browsers on https/localhost and
// in the Capacitor WebView (needs ACCESS_FINE_LOCATION in the manifest).
// Note: like any web page, tracking pauses when the app is closed or the
// phone screen is locked for long.
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';

const SEND_EVERY_MS = 5000;
const MOVE_M = 25;

function distanceM(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function useCourierGps(onDuty) {
  const [position, setPosition] = useState(null); // { lat, lng, accuracy, at }
  const [gpsError, setGpsError] = useState('');
  const [lastSentAt, setLastSentAt] = useState(null);
  const last = useRef({ at: 0, pos: null });

  useEffect(() => {
    if (!onDuty) return undefined;
    if (!('geolocation' in navigator)) {
      setGpsError('This device has no GPS / location support.');
      return undefined;
    }
    setGpsError('');
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const fix = {
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: p.coords.accuracy ?? null,
          heading: Number.isFinite(p.coords.heading) ? p.coords.heading : null,
          speed: Number.isFinite(p.coords.speed) ? p.coords.speed : null,
        };
        setPosition({ ...fix, at: new Date() });
        setGpsError('');
        const now = Date.now();
        const moved = last.current.pos ? distanceM(last.current.pos, fix) : Infinity;
        if (now - last.current.at < SEND_EVERY_MS && moved < MOVE_M) return;
        last.current = { at: now, pos: fix };
        api('/api/driver/location', { method: 'POST', body: fix })
          .then(() => setLastSentAt(new Date()))
          .catch(() => { /* retried on the next fix */ });
      },
      (err) => {
        setGpsError(err.code === 1
          ? 'Location permission denied — allow location for this app so customers and the Yobou team can follow your deliveries.'
          : 'Waiting for a GPS signal…');
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [onDuty]);

  return { position, gpsError, lastSentAt };
}
