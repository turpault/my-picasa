import { buildEmitter, Emitter } from "../../shared/lib/event.js";
import { get } from "./idb-keyval.js";

export type Settings = {
  filters: {
    star: boolean;
    video: boolean;
  };
  inverseSort: boolean;
  sort: "date" | "name";
};

export type SettingsChangeEvent = {
  changed: Settings;
};
const e = buildEmitter<SettingsChangeEvent>();
const settings: Settings = {
  filters: { star: false, video: false },
  sort: "date",
  inverseSort: false,
};

export async function makeSettings() {
  settings.filters.star = (await get("filterByStar")) || false;
  settings.filters.video = (await get("filterByVideos")) || false;
  settings.sort = (await get("sort")) || "date";
  settings.inverseSort = (await get("inverseSort")) || false;
  return e;
}

export function getSettings() {
  return settings;
}

export function getSettingsEmitter(): Emitter<SettingsChangeEvent> {
  return e;
}

export function updateFilterByStar(newValue: boolean) {
  settings.filters.star = newValue;
  e.emit("changed", settings);
}

export function updateFilterByVideos(newValue: boolean) {
  settings.filters.video = newValue;
  e.emit("changed", settings);
}
export function updateSort(newValue: "date" | "name") {
  settings.sort = newValue;
  e.emit("changed", settings);
}
export function updateInverseSort(newValue: boolean) {
  settings.inverseSort = newValue;
  e.emit("changed", settings);
}
