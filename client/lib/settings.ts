import { buildEmitter, Emitter } from "../../shared/lib/event";
import { get, set } from "./idb-keyval";

export type Settings = {
  filters: {
    star: boolean;
    video: boolean;
  };
  iconSize: number;
  inverseSort: boolean;
  sort: "date" | "name";
};

export type SettingsChangeEvent = {
  changed: Settings & { field: string };
};
const e = buildEmitter<SettingsChangeEvent>();
const settings: Settings = {
  filters: { star: false, video: false },
  sort: "date",
  inverseSort: false,
  iconSize: 250,
};

export async function makeSettings() {
  settings.filters.star = (await get("filterByStar")) || false;
  settings.filters.video = (await get("filterByVideos")) || false;
  settings.sort = (await get("sort")) || "date";
  settings.inverseSort = (await get("inverseSort")) || false;
  settings.iconSize = (await get("iconSize")) || 250;
  return e;
}

export function getSettings() {
  return settings;
}

async function changed(field: string) {
  e.emit("changed", { field, ...settings });
  await set("filterByStar", settings.filters.star);
  await set("filterByVideos", settings.filters.video);
  await set("sort", settings.sort);
  await set("inverseSort", settings.inverseSort);
  await set("iconSize", settings.iconSize);
}

export function getSettingsEmitter(): Emitter<SettingsChangeEvent> {
  return e;
}

export function updateFilterByStar(newValue: boolean) {
  settings.filters.star = newValue;
  changed("filters.star");
}
export function updateFilterByVideos(newValue: boolean) {
  settings.filters.video = newValue;
  changed("filters.video");
}
export function updateSort(newValue: "date" | "name") {
  settings.sort = newValue;
  changed("sort");
}
export function updateInverseSort(newValue: boolean) {
  settings.inverseSort = newValue;
  changed("inverseSort");
}
export function updateIconSize(newValue: number) {
  settings.iconSize = newValue;
  changed("iconSize");
}
