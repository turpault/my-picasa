import { FolderMonitor } from "../folder-monitor";
import { getFileExifData } from "../folder-utils";
import { $ } from "../lib/dom";
import {
  SelectionEventSource,
  SelectionManager,
} from "../selection/selection-manager";
declare var L: any;

export function makeMetadata(
  e: HTMLElement,
  selectionEvent: SelectionEventSource,
  monitor: FolderMonitor
) {
  const meta = $(".metadata", e);
  const metasidebar = $(e);
  const map = $(".map", e);
  let mapLeaflet: any;
  let marker: any;
  const close = $(".closemetasidebar");
  close.on("click", () => {
    metasidebar.css("display", "none");
  });
  const open = $(".openmetasidebar");
  open.on("click", () => {
    metasidebar.css("display", "block");
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

  selectionEvent.on("added", (event) => {
    if (event.selection.length === 1) {
      getFileExifData(event.key).then((data) => {
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
        } else {
          hideMap();
        }
        for (const idx in data) {
          if (Number.isNaN(parseInt(idx)))
            // exclude unknown tags
            meta.append(
              `<div><div class="w3-tag">${idx}</div><div>${data[idx]}</div></div>`
            );
        }
      });
    }
  });
}
