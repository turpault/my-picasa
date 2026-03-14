import { useEffect, useState, useRef, useCallback } from "react";
import { usePicisaService, useReconnectVersion } from "../AppContext";
import { events as serverEvents } from "../../../shared/server-events";
import type {
  Album,
  AlbumEntry,
  Filters,
} from "../../../shared/types/types";

export function useAlbumEntries(
  album: Album | null,
  filters?: Filters,
): { entries: AlbumEntry[]; loading: boolean } {
  const service = usePicisaService();
  const reconnectVersion = useReconnectVersion();
  const [entries, setEntries] = useState<AlbumEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const fetchIdRef = useRef(0);
  const albumRef = useRef(album);
  albumRef.current = album;
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const fetchEntries = useCallback(async () => {
    const currentAlbum = albumRef.current;
    if (!service || !currentAlbum) {
      setEntries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = ++fetchIdRef.current;
    const result = await service.media(currentAlbum, filtersRef.current);
    if (id === fetchIdRef.current) {
      const list = Array.isArray(result) ? result : result?.entries ?? [];
      setEntries(list);
      setLoading(false);
    }
  }, [service]);

  const filtersKey = filters ? JSON.stringify(filters) : "";

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries, reconnectVersion, album?.key, filtersKey]);

  useEffect(() => {
    if (!album) return;
    const albumKey = album.key;
    const offs = [
      serverEvents.on("albumEntryAdded", (e) => {
        if (e.album.key === albumKey) fetchEntries();
      }),
      serverEvents.on("albumEntryRemoved", (e) => {
        if (e.album.key === albumKey) fetchEntries();
      }),
      serverEvents.on("albumEntryUpdated", (e) => {
        if (e.album.key === albumKey) fetchEntries();
      }),
      serverEvents.on("reindex", (albums) => {
        if (albums.some((a) => a.key === albumKey)) fetchEntries();
      }),
      serverEvents.on("albumUpdated", (a) => {
        if (a.key === albumKey) fetchEntries();
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [album?.key, fetchEntries]);

  return { entries, loading };
}
