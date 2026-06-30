import { useEffect, useState } from 'react';
import Icon from './Icon';

/**
 * Global network status indicator.
 * - Shows a sticky offline banner when navigator.onLine is false.
 * - Listens for online/offline events and fades out when the connection
 *   comes back, after a short delay so the user sees the recovery.
 */
export default function NetworkStatus() {
  const [online, setOnline] = useState(() => {
    if (typeof navigator === 'undefined') return true;
    return navigator.onLine;
  });
  const [showRecovered, setShowRecovered] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onOffline = () => {
      setOnline(false);
      setShowRecovered(false);
    };
    const onOnline = () => {
      setOnline(true);
      setShowRecovered(true);
      const id = setTimeout(() => setShowRecovered(false), 2_000);
      return () => clearTimeout(id);
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  if (online) {
    if (!showRecovered) return null;
    return (
      <div className="fixed top-0 inset-x-0 z-40 bg-green-600 text-white text-center text-sm py-1.5 px-4 animate-fade-out pointer-events-none">
        <span className="inline-flex items-center gap-1.5">
          <Icon name="wifi" className="text-[16px]" /> You're back online
        </span>
      </div>
    );
  }

  return (
    <div className="fixed top-0 inset-x-0 z-40 bg-error text-white text-center text-sm py-1.5 px-4">
      <span className="inline-flex items-center gap-1.5">
        <Icon name="signal_wifi_off" className="text-[16px]" /> No internet connection. Some features may be unavailable.
      </span>
    </div>
  );
}
