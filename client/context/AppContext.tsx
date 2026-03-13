import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { buildEmitter, type Emitter } from "../../shared/lib/event";
import { events as serverEvents } from "../../shared/server-events";
import type { ServerEvents } from "../../shared/server-events";
import type { PicisaClientApi } from "../../shared/rpc-contracts";
import { connect, getServicePort } from "../rpc/connect";
import type { AlbumEntry } from "../../shared/types/types";

export type TabKind =
  | "Browser"
  | "Editor"
  | "Mosaic"
  | "Gallery"
  | "Slideshow"
  | "Error";

export type AppEvent = {
  ready: { state: boolean };
  keyDown: {
    code: string;
    key: string;
    meta: boolean;
    ctrl: boolean;
    shift: boolean;
    alt: boolean;
    preventDefault: () => void;
  };
  edit: { entry: AlbumEntry };
  returnToBrowser: undefined;
  mosaic: { initialList: AlbumEntry[] };
  slideshow: { initialList: AlbumEntry[] };
  gallery: { initialList: AlbumEntry[]; initialIndex: number };
};

interface AppContextValue {
  service: PicisaClientApi | null;
  connected: boolean;
  reconnectVersion: number;
  appEmitter: Emitter<AppEvent>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [service, setService] = useState<PicisaClientApi | null>(null);
  const [connected, setConnected] = useState(false);
  const [reconnectVersion, setReconnectVersion] = useState(0);
  const appEmitterRef = useRef(buildEmitter<AppEvent>(false));
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const port = getServicePort();
    const hostname = location.hostname || "localhost";
    const connEvents = connect(port, hostname, false);

    let isFirstConnect = true;

    connEvents.on("connected", ({ service: svc }) => {
      svc.on("serverEvent", (serverEvent: { eventType: string; data: any }) => {
        serverEvents.emit(
          serverEvent.eventType as keyof ServerEvents,
          serverEvent.data,
        );
      });

      setService(svc);
      setConnected(true);

      if (!isFirstConnect) {
        setReconnectVersion((v) => v + 1);
      }
      isFirstConnect = false;
    });

    connEvents.on("disconnected", () => {
      setConnected(false);
    });
  }, []);

  return (
    <AppContext.Provider
      value={{
        service,
        connected,
        reconnectVersion,
        appEmitter: appEmitterRef.current,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function usePicisaService(): PicisaClientApi | null {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("usePicisaService must be used within AppProvider");
  return ctx.service;
}

export function useAppEmitter(): Emitter<AppEvent> {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppEmitter must be used within AppProvider");
  return ctx.appEmitter;
}

export function useServerEvents(): Emitter<ServerEvents> {
  return serverEvents;
}

export function useReconnectVersion(): number {
  const ctx = useContext(AppContext);
  if (!ctx)
    throw new Error("useReconnectVersion must be used within AppProvider");
  return ctx.reconnectVersion;
}

export function useIsConnected(): boolean {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useIsConnected must be used within AppProvider");
  return ctx.connected;
}
