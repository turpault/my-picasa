import { getFileExifData } from "../folder-utils";
import { $ } from "../lib/dom";
import { SelectionEventSource } from "../selection/selection-manager";
import { AlbumEntry } from "../../shared/types/types";
import L from "leaflet";
const section = [
  "Make",
  "Model",
  "ISO",
  "ExposureTime",
  "FNumber",
  "DateTimeOriginal",
];

export function makeMetadata(
  e: HTMLElement,
  selectionEvent: SelectionEventSource
) {
  const meta = $(".metadata", e);
  const metasidebar = $(e);
  const map = $(".map", e);
  const file = $(".file", e);
  let mapLeaflet: any;
  let marker: any;

  const open = $(".openmetasidebar");
  let openedMeta = false;
  open.on("click", () => {
    openedMeta=!openedMeta;
    $(".workarea").addRemoveClass('crontract-metadata', openedMeta)
    metasidebar.addRemoveClass('expand-metadata', openedMeta)
    if (mapLeaflet) {
      mapLeaflet.invalidateSize();
    }
  });

  function hideMap() {
    map.css("display", "none");
  }
  function refreshMap(coordinates: {
    GPSLatitude: any;
    GPSLatitudeRef: any;
    GPSLongitudeRef: any;
    GPSLongitude: any;
  }) {
    map.css("display", "");
    if (!mapLeaflet) {
      // Create Leaflet map on map element.
      mapLeaflet = L.map(map.get());
      // Add OSM tile layer to the Leaflet map.
      L.tileLayer("http://{s}.tile.osm.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(mapLeaflet);
      marker = L.marker([0, 0]);
      marker.addTo(mapLeaflet);
    }
    function tripletToDecimal(gps: number[]): number {
      return gps[0] + gps[1] / 60 + gps[2] / 3600;
    }
    const lat =
      coordinates.GPSLatitudeRef === "N"
        ? tripletToDecimal(coordinates.GPSLatitude)
        : -tripletToDecimal(coordinates.GPSLatitude);
    const long =
      coordinates.GPSLongitudeRef === "W"
        ? -tripletToDecimal(coordinates.GPSLongitude)
        : -tripletToDecimal(coordinates.GPSLongitude);
    mapLeaflet.setView([lat, long], 16);
    marker.setLatLng([lat, long]);
  }

  function refreshMetadata(latest: AlbumEntry, selection: AlbumEntry[]) {
    file.empty();

    selection.forEach((sel) =>
      file.append(`<li class="meta-file-entry">${sel.name}</li>`)
    );

    meta.empty();
    hideMap();

    if (selection.length === 1) {
      getFileExifData(latest).then((data) => {
        const {
          GPSLatitude,
          GPSLatitudeRef,
          GPSLongitudeRef,
          GPSLongitude,
        } = data;
        if (GPSLatitude && GPSLongitude) {
          refreshMap({
            GPSLatitude,
            GPSLatitudeRef,
            GPSLongitudeRef,
            GPSLongitude,
          });
        }
        for (const idx in data) {
          if (Number.isNaN(parseInt(idx)))
            if (section.includes(idx)) {
              // exclude unknown tags
              let val = data[idx];
              if (idx.includes("Date")) {
                val = new Date(data[idx]).toLocaleString();
              } else if (idx.includes("Time")) {
                const v = parseFloat(data[idx]);
                val = v < 1 ? `1/${Math.round(1 / v)} s` : `${v} s`;
              }
              meta.append(
                `<div><div class="w3-tag">${idx}</div><div>${val}</div></div>`
              );
            }
        }
      });
    }
  }
  selectionEvent.on("added", (event) => {
    refreshMetadata(event.key, event.selection);
  });
}
