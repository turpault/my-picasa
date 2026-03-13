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
import type { Shortcut } from "../../../shared/types/types";

const ShortcutsCacheContext = createContext<Shortcut[]>([]);

export function ShortcutsCacheProvider({ children }: { children: ReactNode }) {
  const service = usePicisaService();
  const reconnectVersion = useReconnectVersion();
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  const fetchIdRef = useRef(0);

  const fetchShortcuts = useCallback(async () => {
    if (!service) return;
    const id = ++fetchIdRef.current;
    const result = await service.getShortcuts();
    if (id === fetchIdRef.current) {
      setShortcuts(result);
    }
  }, [service]);

  useEffect(() => {
    fetchShortcuts();
  }, [fetchShortcuts, reconnectVersion]);

  useEffect(() => {
    const off = serverEvents.on("shortcutsUpdated", fetchShortcuts);
    return off;
  }, [fetchShortcuts]);

  return (
    <ShortcutsCacheContext.Provider value={shortcuts}>
      {children}
    </ShortcutsCacheContext.Provider>
  );
}

export function useShortcuts(): Shortcut[] {
  return useContext(ShortcutsCacheContext);
}
