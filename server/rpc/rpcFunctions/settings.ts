import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";
import { events } from "../../../shared/server-events";

type Filters = {
  star: number;
  video: boolean;
  people: boolean;
  persons: string[];
  location: boolean;
  isFavoriteInIPhoto: boolean;
  text: string;
};

type Settings = {
  filters: Filters;
  iconSize: number;
  inverseSort: boolean;
  sort: "date" | "name";
};

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

function settingsPath(): string {
  return (
    process.env.PICISA_SETTINGS_PATH ||
    join(homedir(), ".picisa", "settings.json")
  );
}

function readSettings(): Settings {
  const path = settingsPath();
  if (!existsSync(path)) {
    return structuredClone(DEFAULT_SETTINGS);
  }
  try {
    const raw = readFileSync(path, "utf8");
    return JSON.parse(raw) as Settings;
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

function writeSettings(settings: Settings): void {
  const path = settingsPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(settings, null, 2), "utf8");
}

function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target };
  for (const key of Object.keys(source) as (keyof T)[]) {
    const srcVal = source[key];
    if (
      srcVal !== null &&
      typeof srcVal === "object" &&
      !Array.isArray(srcVal) &&
      typeof result[key] === "object" &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(
        result[key] as Record<string, any>,
        srcVal as Record<string, any>,
      ) as T[keyof T];
    } else if (srcVal !== undefined) {
      result[key] = srcVal as T[keyof T];
    }
  }
  return result;
}

export async function getSettings(): Promise<Settings> {
  return readSettings();
}

export async function updateSettings(
  settings: Partial<Settings>,
): Promise<Settings> {
  const current = readSettings();
  const merged = deepMerge(current, settings);
  writeSettings(merged);
  events.emit("settingsChanged", {});
  return merged;
}

export function registerSettingsRpc(serviceMap: Record<string, Function>) {
  serviceMap.getSettings = getSettings;
  serviceMap.updateSettings = updateSettings;
}
