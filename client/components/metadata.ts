import { FolderMonitor } from "../folder-monitor.js";
import { getFileExifData } from "../folder-utils.js";
import { $ } from "../lib/dom.js";
import { albumEntryFromId } from "../../shared/lib/utils.js";
import { SelectionEventSource } from "../selection/selection-manager.js";
declare var L: any;

export function makeMetadata(
  e: HTMLElement,
  selectionEvent: SelectionEventSource,
  monitor: FolderMonitor
) {
  const meta = $("#metadata", e);
  const metasidebar = $(e);
  const map = $("#map", e);
  let mapLeaflet: any;
  let marker: any;
  const close = $("#closemetasidebar");
  close.on("click", () => {
    metasidebar.css("display", "none");
  });
  const open = $("#openmetasidebar");
  open.on("click", () => {
    metasidebar.css("display", "block");
    if (mapLeaflet) {
      mapLeaflet.invalidateSize();
    }
  });

  function refreshMap(coordinates: {
    GPSLatitude: any;
    GPSLatitudeRef: any;
    GPSLongitudeRef: any;
    GPSLongitude: any;
  }) {
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

    const lat =
      coordinates.GPSLatitudeRef.value[0] === "N"
        ? coordinates.GPSLatitude.description
        : -coordinates.GPSLatitude.description;
    const long =
      coordinates.GPSLongitudeRef.value[0] === "W"
        ? -coordinates.GPSLongitude.description
        : -coordinates.GPSLongitude.description;
    mapLeaflet.setView([lat, long], 16);
    marker.setLatLng([lat, long]);
  }

  selectionEvent.on("added", (event) => {
    const { album, name } = albumEntryFromId(event.key);
    getFileExifData(album, name).then((data) => {
      meta.empty();
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
        meta.append(
          `<div><div class="w3-tag">${idx}</div><div>${data[idx].description}</div></div>`
        );
      }
    });
  });
}
