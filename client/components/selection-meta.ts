import L from "leaflet";
import { FaceList, debounced, decodeFaces } from "../../shared/lib/utils";
import { getFilesExifData, getMetadata } from "../folder-utils";
import { albumThumbnailUrl } from "../imageProcess/client";
import { $, _$ } from "../lib/dom";
import { State } from "../lib/state";
import { getService } from "../rpc/connect";
import { AlbumEntrySelectionManager } from "../selection/selection-manager";
import {
  AlbumEntry,
  AlbumEntryMetaData,
  AlbumWithData,
  undoStep,
} from "../types/types";
import { t } from "./strings";
type MetaTransform = {
  label: string;
  available: string[];
  transform: (object: any) => string;
};
const metaSections: MetaTransform[] = [
  {
    label: "Make",
    available: ["Make"],
    transform: (object: any) => object.Make,
  },
  {
    label: "Model",
    available: ["Model"],
    transform: (object: any) => object.Model,
  },
  { label: "ISO", available: ["ISO"], transform: (object: any) => object.ISO },
  {
    label: "Exposure Time",
    available: ["ExposureTime"],
    transform: (object: any) => `1/${1 / parseFloat(object.ExposureTime)}`,
  },
  {
    label: "F-Number",
    available: ["FNumber"],
    transform: (object: any) => `f/${object.FNumber}`,
  },
  {
    label: "Original Date",
    available: ["DateTimeOriginal"],
    transform: (object: any) =>
      new Date(object.DateTimeOriginal).toLocaleString(),
  },
  {
    label: "Size (pixels)",
    available: ["ExifImageHeight", "ExifImageWidth"],
    transform: (object: any) =>
      `${object.ExifImageHeight} x ${object.ExifImageHeight}`,
  },
  {
    label: "Created",
    available: ["birthtime"],
    transform: (object: any) => new Date(object.birthtime).toLocaleString(),
  },
  {
    label: "Changed",
    available: ["ctime"],
    transform: (object: any) => new Date(object.ctime).toLocaleString(),
  },
  {
    label: "Modified",
    available: ["mtime"],
    transform: (object: any) => new Date(object.mtime).toLocaleString(),
  },
  {
    label: "Size",
    available: ["size"],
    transform: (object: any) =>
      `${(parseFloat(object.size) / 1024 / 1024).toFixed(2)} MB`,
  },
];

const html = `
<div class="selection-metadata-pane">
  <div class="selection-metadata-header">
    <span class="selection-metadata-header-title"></span>
    <span class="selection-metadata-header-close">⨯</span>
  </div>
  <div class="selection-metadata-content">
    <div class="fill selection-metadata">
      <div class="selection-metadata-list"></div>
    </div>
    <div class="fill selection-persons">
      <div class="selection-persons-list"></div>
    </div>
    <div class="fill selection-location">
      <div class="selection-location-map"></div>
    </div>  
  </div>
</div>`;

export enum META_PAGES {
  METADATA = "metadata",
  LOCATION = "location",
  PERSONS = "persons",
}
export type SelectionStateDef = {
  META_PAGE: META_PAGES;
  META_SINGLE_SELECTION_MODE: boolean;
  active: AlbumEntry | null;
  selected: AlbumEntry[];
  undo: undoStep[];
  stars: number;
};
export type ApplicationState = State<SelectionStateDef>;

export function makeMetadata(
  selection: AlbumEntrySelectionManager,
  state: ApplicationState
): _$ {
  const e = $(html);
  const title = $(".selection-metadata-header-title", e);
  const pages = {
    metadata: { e: $(".selection-metadata-list", e), update: updateMetadata },
    persons: { e: $(".selection-persons-list", e), update: updatePersons },
    location: {
      e: $(".selection-location-map", e),
      update: updateLocation,
    },
  };
  const debouncedUpdate = debounced(update, 1000, false);
  state.events.on("META_PAGE", update);
  state.events.on("META_SINGLE_SELECTION_MODE", update);

  selection.events.on("*", () => {
    debouncedUpdate();
  });
  update();

  let imageData: {
    entry: AlbumEntry;
    metadata: AlbumEntryMetaData;
    exifData: any;
  }[] = [];

  async function update() {
    const visible = state.getValue("META_PAGE") !== undefined;
    e.show(visible);
    const activeOnly = !!state.getValue("META_SINGLE_SELECTION_MODE");

    if (!visible) return;
    const page = state.getValue("META_PAGE");
    title.text(t(page as string));
    for (const [key, p] of Object.entries(pages)) {
      if (page !== key) {
        p.e.hide();
      } else {
        p.e.show();
        // Populate the page
        imageData = [];
        p.update();

        const selections =
          activeOnly && selection.active()
            ? [selection.active()]
            : selection.selected();
        if (selections.some((s) => !s)) debugger;

        const [metadata, exifData] = await Promise.all([
          getMetadata(selections),
          getFilesExifData(selections),
        ]);
        imageData = selections.map((selection, index) => ({
          entry: selection,
          metadata: metadata[index].metadata,
          exifData: exifData[index],
        }));
        p.update();
      }
    }
  }

  function updateMetadata() {
    pages.metadata.e.empty();
    for (const data of imageData) {
      if (!data.exifData) return;
      pages.metadata.e
        .append(
          `<div class="metadata-section-filename">${data.entry.name}</div>`
        )
        .on("click", () => {
          selection.setActive(data.entry);
        });
      const keys = Object.keys(data.exifData);
      for (const section of metaSections) {
        if (section.available.find((s) => !keys.includes(s)) === undefined) {
          pages.metadata.e.append(
            `<div class="metadata-section">${t(section.label)}</div>`
          );
          pages.metadata.e.append(
            `<div class="metadata-section-value">${section.transform(
              data.exifData
            )}</div>`
          );
        }
      }
    }
  }

  async function updatePersons() {
    pages.persons.e.empty();
    const faces = imageData
      .map((i) => i.metadata.faces)
      .filter((i) => !!i)
      .map((faces) => decodeFaces(faces))
      .flat()
      .reduce((prev, val) => {
        prev.find((a) => a.hash === val.hash) || prev.push(val);
        return prev;
      }, [] as FaceList);

    const s = await getService();
    const faceAlbums = (await Promise.all(
      faces.map((face) => s.getFaceAlbumFromHash(face.hash))
    )) as AlbumWithData[];

    const uniqueFaces = faceAlbums.reduce(
      (prev, val) =>
        !val.key || prev.find((a) => a.key === val.key) ? prev : [...prev, val],
      [] as AlbumWithData[]
    );
    uniqueFaces.forEach((faceAlbum) => {
      const url = albumThumbnailUrl(faceAlbum);
      pages.persons.e.append(
        `<div class="selection-person-entry"><img class="selection-person-entry-thumb" src="${url}"><span class="selection-person-entry-label">${faceAlbum.name}</span></div>`
      );
    });
  }

  let mapLeaflet: any;
  let markers: any[] = [];
  function updateLocation() {
    if (imageData.length !== 0) {
      if (!mapLeaflet) {
        // Create Leaflet map on map element.
        mapLeaflet = L.map(pages.location.e.get());
        L.tileLayer("http://{s}.tile.osm.org/{z}/{x}/{y}.png", {
          attribution:
            '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(mapLeaflet);
        new ResizeObserver(
          debounced(() => {
            const parentSize = pages.location.e.parent().clientRect();
            pages.location.e.css({
              width: `${parentSize.width - 14}px`,
              height: `${parentSize.height - 10}px`,
            });
          })
        ).observe(pages.location.e.parent().get());
      }
      markers.forEach((m) => m.remove());
      const latLongs: [number, number, AlbumEntry][] = [];
      for (const coordinates of imageData.map((i) => i.exifData)) {
        // Add OSM tile layer to the Leaflet map.
        if (
          coordinates.GPSLatitudeRef === undefined ||
          coordinates.GPSLongitudeRef === undefined
        )
          continue;
        const lat =
          coordinates.GPSLatitudeRef === "N"
            ? tripletToDecimal(coordinates.GPSLatitude)
            : -tripletToDecimal(coordinates.GPSLatitude);
        const long =
          coordinates.GPSLongitudeRef === "W"
            ? -tripletToDecimal(coordinates.GPSLongitude)
            : -tripletToDecimal(coordinates.GPSLongitude);
        latLongs.push([lat, long, coordinates.entry]);
      }
      if (latLongs.length === 0) return;
      for (const latLong of latLongs) {
        const marker = L.marker([latLong[0], latLong[1]]);
        marker.on("click", () => {
          selection.setActive(latLong[2]);
        });

        markers.push(marker);
        marker.addTo(mapLeaflet);
      }

      // calculate center
      const minLat = Math.min(...latLongs.map((l) => l[0]));
      const maxLat = Math.max(...latLongs.map((l) => l[0]));
      const minLong = Math.min(...latLongs.map((l) => l[1]));
      const maxLong = Math.max(...latLongs.map((l) => l[1]));
      const maxDist = Math.max(maxLat - minLat, maxLong - minLong);
      const ratio = 8 + Math.log2(1 / maxDist);
      const center = [(minLat + maxLat) / 2, (minLong + maxLong) / 2];
      mapLeaflet.setView(center, ratio);
    }
  }
  return e;
}
function tripletToDecimal(gps: number[]): number {
  return gps[0] + gps[1] / 60 + gps[2] / 3600;
}
