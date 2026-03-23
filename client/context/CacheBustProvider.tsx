import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { events as serverEvents } from "../../shared/server-events";
import type { AlbumEntry } from "../../shared/types/types";

type CacheBustFn = (entry: AlbumEntry) => number;

const CacheBustContext = createContext<CacheBustFn>(() => 0);

function entryKey(entry: AlbumEntry): string {
  return entry.album.key + "/" + entry.name;
}

export function CacheBustProvider({ children }: PropsWithChildren) {
  const bustMapRef = useRef(new Map<string, number>());
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const bump = (entry: AlbumEntry) => {
      const key = entryKey(entry);
      const current = bustMapRef.current.get(key) ?? 0;
      bustMapRef.current.set(key, current + 1);
      setVersion((v) => v + 1);
    };
    const offs = [
      serverEvents.on("albumEntryAspectChanged", bump),
      serverEvents.on("thumbnailRebuilt", ({ entry }) => bump(entry)),
    ];
    return () => offs.forEach((o) => o());
  }, []);

  const getBust = useMemo<CacheBustFn>(
    () => (entry: AlbumEntry) => bustMapRef.current.get(entryKey(entry)) ?? 0,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  );

  return (
    <CacheBustContext.Provider value={getBust}>
      {children}
    </CacheBustContext.Provider>
  );
}

export function useCacheBust(): CacheBustFn {
  return useContext(CacheBustContext);
}
