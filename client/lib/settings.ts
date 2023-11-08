import { buildEmitter, Emitter } from "../../shared/lib/event";
import { get, set } from "./idb-keyval";

export type Settings = {
  filters: {
    star: number;
    video: number;
    text: string;
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
  filters: { star: 0, video: 0, text: "" },
  sort: "date",
  inverseSort: false,
  iconSize: 250,
};

export async function makeSettings() {
  settings.filters.star = (await get("filterByStar")) || 0;
  settings.filters.video = (await get("filterByVideos")) || 0;
  settings.filters.text = (await get("filterByText")) || "";
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

export function updateFilterByStar(newValue: number) {
  settings.filters.star = newValue;
  changed("filters.star");
}
export function updateFilterByVideos(newValue: number) {
  settings.filters.video = newValue;
  changed("filters.video");
}
export function updateSort(newValue: "date" | "name") {
  settings.sort = newValue;
  changed("sort");
}
export function updateFilterByText(newValue: string) {
  settings.filters.text = newValue;
  changed("filters.text");
}

export function updateInverseSort(newValue: boolean) {
  settings.inverseSort = newValue;
  changed("inverseSort");
}
export function updateIconSize(newValue: number) {
  settings.iconSize = newValue;
  changed("iconSize");
}
