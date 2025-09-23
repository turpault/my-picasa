import { buildEmitter, Emitter } from "../../shared/lib/event";
import { get, set } from "./idb-keyval";

export type Settings = {
  filters: {
    star: number;
    video: boolean;
    people: boolean;
    persons: string[];
    location: boolean;
    favoritePhoto: boolean;
    text: string;
  };
  search: string;
  iconSize: number;
  inverseSort: boolean;
  sort: "date" | "name";
};

export type SettingsChangeEvent = {
  changed: Settings & { field: string };
};
const e = buildEmitter<SettingsChangeEvent>();
const settings: Settings = {
  filters: {
    star: 0,
    video: false,
    people: false,
    location: false,
    favoritePhoto: false,
    persons: [],
    text: "",
  },
  search: "",
  sort: "date",
  inverseSort: false,
  iconSize: 250,
};

export async function makeSettings() {
  settings.filters.star = (await get("filterByStar")) || 0;
  settings.filters.video = (await get("filterByVideos")) || false;
  settings.filters.people = (await get("filterByPeople")) || false;
  settings.filters.persons = ((await get("filterByPerson")) || "")
    .split("|")
    .filter((v: string) => v.trim());
  settings.filters.location = (await get("filterByLocation")) || false;
  settings.filters.favoritePhoto = (await get("favoritePhoto")) || false;
  settings.filters.text = (await get("filterByText")) || "";
  settings.search = settings.filters.text;
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
  await set("filterByPeople", settings.filters.people);
  await set("filterByPerson", settings.filters.persons.join("|"));
  await set("filterByLocation", settings.filters.location);
  await set("filterByFavoritePhoto", settings.filters.favoritePhoto);
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
export function updateFilterByVideos(newValue: boolean) {
  settings.filters.video = newValue;
  changed("filters.video");
}
export function updateFilterByLocation(newValue: boolean) {
  settings.filters.location = newValue;
  changed("filters.location");
}
export function updateFilterByFavoritePhoto(newValue: boolean) {
  settings.filters.favoritePhoto = newValue;
  changed("filters.favoritePhoto");
}
export function updateFilterByPeople(newValue: boolean) {
  settings.filters.people = newValue;
  changed("filters.people");
}
export function updateFilterByPersons(values: string[]) {
  settings.filters.persons = values;
  changed("filters.person");
}
export function updateSort(newValue: "date" | "name") {
  settings.sort = newValue;
  changed("sort");
}
export function updateFilterByText(newValue: string) {
  settings.filters.text = newValue;
  settings.search = newValue;
  changed("filters.text");
  changed("search");
}

export function updateInverseSort(newValue: boolean) {
  settings.inverseSort = newValue;
  changed("inverseSort");
}
export function updateIconSize(newValue: number) {
  settings.iconSize = newValue;
  changed("iconSize");
}
