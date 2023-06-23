import L from "leaflet";
import { AlbumEntry } from "../../shared/types/types";
import { getFileExifData } from "../folder-utils";
import { $, _$ } from "../lib/dom";
import { t } from "./strings";
const section: { [k: string]: any } = {
  Make: () => t("Make"),
  Model: () => t("Model"),
  ISO: () => t("ISO"),
  ExposureTime: () => t("Exposure Time"),
  FNumber: () => t("F-Number"),
  DateTimeOriginal: () => t("Original Date"),
  ExifImageHeight: () => t("Height (pixels)"),
  ExifImageWidth: () => t("Width (pixels)"),
  birthtime: () => t("Created"),
  ctime: () => t("Changed"),
  mtime: () => t("Modified"),
  size: () => t("Size"),
};
const metaHTML = ` <div>
<div class="metadata"></div>
<div class="map"></div>
</div>
`;
export function makeMetadata(e: _$) {
  const metasidebar = $(metaHTML);
  e.append(metasidebar);
  const map = $(".map", metasidebar);
  const meta = $(".metadata", metasidebar);
  let mapLeaflet: any;
  let marker: any;

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

  function refreshMetadata(
    latest: AlbumEntry | undefined,
    selection: AlbumEntry[],
    info: {
      width: number;
      height: number;
    }
  ) {
    meta.empty();
    selection.forEach((sel, idx) =>
      meta.append(
        `<div><div class="exif-name">File #${idx}</div><div class="exif-value">${sel.name}</div></div>`
      )
    );

    hideMap();

    if (latest && selection.length === 1) {
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
        meta.append(
          `<div><div class="exif-name">${t(
            "Width"
          )}</div><div class="exif-value">${info.width}</div></div>`
        );
        meta.append(
          `<div><div class="exif-name">${t(
            "Height"
          )}</div><div class="exif-value">${info.height}</div></div>`
        );
        for (const idx in data) {
          if (Number.isNaN(parseInt(idx)))
            if (section.hasOwnProperty(idx)) {
              // exclude unknown tags
              let val = data[idx];
              if (idx.toLowerCase().includes("date")) {
                val = new Date(data[idx]).toLocaleString();
              } else if (idx.includes("Time")) {
                const v = parseFloat(data[idx]);
                val = v < 1 ? `1/${Math.round(1 / v)} s` : `${v} s`;
              } else if (idx.includes("time")) {
                val = new Date(data[idx]).toLocaleString();
              }
              meta.append(
                `<div><div class="exif-name">${section[
                  idx
                ]()}</div><div class="exif-value">${val}</div></div>`
              );
            }
        }
      });
    }
  }
  return refreshMetadata;
}
