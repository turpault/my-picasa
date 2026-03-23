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
import { useSettings } from "../SettingsProvider";
import { events as serverEvents } from "../../../shared/server-events";
import { isFilterEmpty } from "../../lib/settings";
import type { AlbumWithData } from "../../../shared/types/types";

const AlbumsCacheContext = createContext<AlbumWithData[]>([]);

const AlbumsRefetchContext = createContext<
  () => Promise<AlbumWithData[]>
>(async () => []);

export function AlbumsCacheProvider({ children }: { children: ReactNode }) {
  const service = usePicisaService();
  const reconnectVersion = useReconnectVersion();
  const { filters } = useSettings();
  const [albums, setAlbums] = useState<AlbumWithData[]>([]);
  const fetchIdRef = useRef(0);

  const effectiveFilters = isFilterEmpty(filters) ? undefined : filters;
  const filtersKey = effectiveFilters ? JSON.stringify(effectiveFilters) : "";

  const fetchAlbums = useCallback(async () => {
    if (!service) return;
    const id = ++fetchIdRef.current;
    const result = await service.folders(effectiveFilters);
    if (id === fetchIdRef.current) {
      const filtered =
        effectiveFilters ? result.filter((a) => a.count > 0) : result;
      setAlbums(filtered);
    }
  }, [service, effectiveFilters]);

  useEffect(() => {
    fetchAlbums();
  }, [fetchAlbums, reconnectVersion, filtersKey]);

  useEffect(() => {
    const offs = [
      serverEvents.on("albumAdded", fetchAlbums),
      serverEvents.on("albumUpdated", fetchAlbums),
      serverEvents.on("albumRemoved", fetchAlbums),
      serverEvents.on("shortcutsUpdated", fetchAlbums),
    ];
    return () => offs.forEach((off) => off());
  }, [fetchAlbums]);

  const refetchAlbums = useCallback(async (): Promise<AlbumWithData[]> => {
    if (!service) return [];
    const result = await service.folders(effectiveFilters);
    const filtered =
      effectiveFilters ? result.filter((a) => a.count > 0) : result;
    setAlbums(filtered);
    return filtered;
  }, [service, effectiveFilters]);

  return (
    <AlbumsRefetchContext.Provider value={refetchAlbums}>
      <AlbumsCacheContext.Provider value={albums}>
        {children}
      </AlbumsCacheContext.Provider>
    </AlbumsRefetchContext.Provider>
  );
}

export function useAlbums(): AlbumWithData[] {
  return useContext(AlbumsCacheContext);
}

export function useAlbumsRefetch(): () => Promise<AlbumWithData[]> {
  return useContext(AlbumsRefetchContext);
}
