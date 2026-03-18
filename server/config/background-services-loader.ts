import { readFileSync } from "fs";
import { join } from "path";
import { rootPath } from "../utils/constants";

export type BackgroundServiceConfig = {
  intervalMinutes: number;
  enabled: boolean;
};

export type BackgroundServicesConfig = {
  faces: BackgroundServiceConfig;
  geolocate: BackgroundServiceConfig;
  favoriteExporter: BackgroundServiceConfig;
  fts: BackgroundServiceConfig;
};

const DEFAULT_CONFIG: BackgroundServicesConfig = {
  faces: { intervalMinutes: 1440, enabled: true },
  geolocate: { intervalMinutes: 60, enabled: true },
  favoriteExporter: { intervalMinutes: 30, enabled: true },
  fts: { intervalMinutes: 120, enabled: true },
};

const CONFIG_PATH = join(rootPath, "server", "config", "background-services.json");

let cachedConfig: BackgroundServicesConfig | null = null;

export function getBackgroundServicesConfig(): BackgroundServicesConfig {
  if (cachedConfig) return cachedConfig;
  try {
    const content = readFileSync(CONFIG_PATH, "utf-8");
    cachedConfig = { ...DEFAULT_CONFIG, ...JSON.parse(content) };
  } catch {
    cachedConfig = DEFAULT_CONFIG;
  }
  return cachedConfig;
}
