import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import { usePicisaService, useReconnectVersion } from "../AppContext";
import { events as serverEvents } from "../../../shared/server-events";
import { useSettings } from "../SettingsProvider";
import { isFilterEmpty } from "../../lib/settings";
import type { AlbumWithData } from "../../../shared/types/types";

const AlbumsCacheContext = createContext<AlbumWithData[]>([]);

export function AlbumsCacheProvider({ children }: { children: ReactNode }) {
  const service = usePicisaService();
  const reconnectVersion = useReconnectVersion();
  const settings = useSettings();
  const [albums, setAlbums] = useState<AlbumWithData[]>([]);
  const fetchIdRef = useRef(0);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const fetchAlbums = useCallback(async () => {
    if (!service) return;
    const id = ++fetchIdRef.current;
    const filters = isFilterEmpty(settingsRef.current.filters);
    const result = await service.folders(filters);
    if (id === fetchIdRef.current) {
      setAlbums(result);
    }
  }, [service]);

  const filtersKey = JSON.stringify(settings.filters);

  useEffect(() => {
    fetchAlbums();
  }, [fetchAlbums, reconnectVersion, filtersKey]);

  useEffect(() => {
    const offs = [
      serverEvents.on("albumAdded", fetchAlbums),
      serverEvents.on("albumUpdated", fetchAlbums),
      serverEvents.on("albumRemoved", fetchAlbums),
    ];
    return () => offs.forEach((off) => off());
  }, [fetchAlbums]);

  return (
    <AlbumsCacheContext.Provider value={albums}>
      {children}
    </AlbumsCacheContext.Provider>
  );
}

export function useAlbums(): AlbumWithData[] {
  return useContext(AlbumsCacheContext);
}
