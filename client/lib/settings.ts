import { buildEmitter, Emitter } from "../../shared/lib/event";
import { get, set } from "./idb-keyval";

export type Settings = {
  filters: {
    star: boolean;
    video: boolean;
  };
  inverseSort: boolean;
  sort: "date" | "name";
  filter: string;
};

export type SettingsChangeEvent = {
  changed: Settings;
};
const e = buildEmitter<SettingsChangeEvent>();
const settings: Settings = {
  filters: { star: false, video: false },
  sort: "date",
  inverseSort: false,
  filter: "",
};

export async function makeSettings() {
  settings.filters.star = (await get("filterByStar")) || false;
  settings.filters.video = (await get("filterByVideos")) || false;
  settings.sort = (await get("sort")) || "date";
  settings.inverseSort = (await get("inverseSort")) || false;
  settings.filter = (await get("filter")) || "";
  return e;
}

export function getSettings() {
  return settings;
}

async function changed() {
  e.emit("changed", settings);
  await set("filterByStar", settings.filters.star);
  await set("filterByVideos", settings.filters.video);
  await set("sort", settings.sort);
  await set("inverseSort", settings.inverseSort);
  await set("filter", settings.filter);
}

export function getSettingsEmitter(): Emitter<SettingsChangeEvent> {
  return e;
}

export function updateFilterByStar(newValue: boolean) {
  settings.filters.star = newValue;
  changed();
}
export function updateFilterByVideos(newValue: boolean) {
  settings.filters.video = newValue;
  changed();
}
export function updateSort(newValue: "date" | "name") {
  settings.sort = newValue;
  changed();
}
export function updateInverseSort(newValue: boolean) {
  settings.inverseSort = newValue;
  changed();
}
export function updateFilter(newValue: string) {
  settings.filter = newValue;
  changed();
}
