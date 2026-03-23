import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { usePicisaService, useReconnectVersion } from "./AppContext";
import { events as serverEvents } from "../../shared/server-events";
import type { Filters } from "../../shared/types/types";
import type { Settings } from "../lib/settings";

const DEFAULT_SETTINGS: Settings = {
  filters: {
    star: 0,
    video: false,
    people: false,
    persons: [],
    location: false,
    isFavoriteInIPhoto: false,
    text: "",
  },
  sort: "date",
  inverseSort: false,
  iconSize: 250,
};

type SettingsContextValue = {
  settings: Settings;
  updateSettings: (partial: Partial<Settings>) => Promise<void>;
  updateFilter: (field: keyof Filters, value: any) => Promise<void>;
};

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  updateSettings: async () => {},
  updateFilter: async () => {},
});

export function SettingsProvider({ children }: PropsWithChildren) {
  const service = usePicisaService();
  const reconnectVersion = useReconnectVersion();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const fetchSettings = useCallback(async () => {
    if (!service) return;
    try {
      const fetched = await service.getSettings();
      if (fetched) setSettings(fetched);
    } catch {
      // RPC method may not exist yet on the server; keep defaults
    }
  }, [service]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings, reconnectVersion]);

  useEffect(() => {
    return serverEvents.on("settingsChanged", () => {
      fetchSettings();
    });
  }, [fetchSettings]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--thumbnail-size",
      `${settings.iconSize}px`,
    );
  }, [settings.iconSize]);

  const updateSettings = useCallback(
    async (partial: Partial<Settings>) => {
      setSettings((prev) => ({ ...prev, ...partial }));
      if (!service) return;
      try {
        await service.updateSettings(partial);
      } catch {
        // RPC method may not exist yet on the server
      }
    },
    [service],
  );

  const updateFilter = useCallback(
    async (field: keyof Filters, value: any) => {
      const newFilters = { ...settingsRef.current.filters, [field]: value };
      await updateSettings({ filters: newFilters });
    },
    [updateSettings],
  );

  const value = useMemo<SettingsContextValue>(
    () => ({ settings, updateSettings, updateFilter }),
    [settings, updateSettings, updateFilter],
  );

  return (
    <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
  );
}

export function useSettings(): Settings {
  return useContext(SettingsContext).settings;
}

export function useUpdateSettings(): (
  partial: Partial<Settings>,
) => Promise<void> {
  return useContext(SettingsContext).updateSettings;
}

export function useUpdateFilter(): (
  field: keyof Filters,
  value: any,
) => Promise<void> {
  return useContext(SettingsContext).updateFilter;
}
