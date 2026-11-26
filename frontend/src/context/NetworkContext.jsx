import React, { createContext, useContext, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';

const NetworkContext = createContext({ isOnline: true, connectionType: 'unknown' });

export function NetworkProvider({ children }) {
  const [networkState, setNetworkState] = useState({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    connectionType: 'unknown',
  });

  useEffect(() => {
    let listenerHandle = null;

    const handleOnline = () =>
      setNetworkState((prev) => ({ ...prev, isOnline: true }));
    const handleOffline = () =>
      setNetworkState((prev) => ({ ...prev, isOnline: false }));

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (Capacitor.isNativePlatform()) {
      Network.getStatus()
        .then((s) =>
          setNetworkState({ isOnline: s.connected, connectionType: s.connectionType })
        )
        .catch(() => {});

      Network.addListener('networkStatusChange', (s) => {
        setNetworkState({ isOnline: s.connected, connectionType: s.connectionType });
      })
        .then((handle) => {
          listenerHandle = handle;
        })
        .catch(() => {});
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (listenerHandle?.remove) listenerHandle.remove();
    };
  }, []);

  return <NetworkContext.Provider value={networkState}>{children}</NetworkContext.Provider>;
}

export function useNetwork() {
  return useContext(NetworkContext);
}
