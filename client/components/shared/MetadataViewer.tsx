import { useState, useEffect, useRef, useMemo } from "react";
import L from "leaflet";
import { usePicisaService } from "../../context/AppContext";
import { events } from "../../../shared/server-events";
import {
  albumEntriesWithMetadataAndExif,
  albumThumbnailUrl,
} from "../../imageProcess/client";
import { t } from "../strings";
import type {
  AlbumEntry,
  AlbumEntryWithMetadataAndExif,
} from "../../../shared/types/types";

type MetaTransform = {
  label: string;
  available: string[];
  transform: (object: any) => string;
};

const metaSections: MetaTransform[] = [
  { label: "Make", available: ["Make"], transform: (o) => o.Make },
  { label: "Model", available: ["Model"], transform: (o) => o.Model },
  { label: "ISO", available: ["ISO"], transform: (o) => o.ISO },
  {
    label: "Exposure Time",
    available: ["ExposureTime"],
    transform: (o) => `1/${1 / parseFloat(o.ExposureTime)}`,
  },
  {
    label: "F-Number",
    available: ["FNumber"],
    transform: (o) => `f/${o.FNumber}`,
  },
  {
    label: "Original Date",
    available: ["DateTimeOriginal"],
    transform: (o) => new Date(o.DateTimeOriginal).toLocaleString(),
  },
  {
    label: "Size (pixels)",
    available: ["ExifImageHeight", "ExifImageWidth"],
    transform: (o) => `${o.ExifImageWidth} x ${o.ExifImageHeight}`,
  },
  {
    label: "Created",
    available: ["birthtime"],
    transform: (o) => new Date(o.birthtime).toLocaleString(),
  },
  {
    label: "Changed",
    available: ["ctime"],
    transform: (o) => new Date(o.ctime).toLocaleString(),
  },
  {
    label: "Modified",
    available: ["mtime"],
    transform: (o) => new Date(o.mtime).toLocaleString(),
  },
  {
    label: "Size",
    available: ["size"],
    transform: (o) => `${(parseFloat(o.size) / 1024 / 1024).toFixed(2)} MB`,
  },
];

function tripletToDecimal(gps: number[]): number {
  return gps[0] + gps[1] / 60 + gps[2] / 3600;
}

export type MetaPage = "metadata" | "location" | "persons";

interface MetadataViewerProps {
  entries: AlbumEntry[];
  page: MetaPage | null;
  onClose: () => void;
}

export function MetadataViewer({ entries, page, onClose }: MetadataViewerProps) {
  const service = usePicisaService();
  const [imageData, setImageData] = useState<AlbumEntryWithMetadataAndExif[]>([]);
  const [faces, setFaces] = useState<{ name: string; contactAlbum: any }[]>([]);
  const [dataTick, setDataTick] = useState(0);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);

  const entriesKey = useMemo(
    () => entries.map((e) => `${e.album.key}/${e.name}`).sort().join("\0"),
    [entries],
  );

  useEffect(() => {
    if (!page || !entriesKey) return;
    const keySet = new Set(entriesKey.split("\0").filter(Boolean));
    const match = (e: { album: { key: string }; name: string }) =>
      keySet.has(`${e.album.key}/${e.name}`);
    const bump = () => setDataTick((n) => n + 1);
    const offs = [
      events.on("favoriteChanged", ({ entry }) => {
        if (match(entry)) bump();
      }),
      events.on("albumEntryAspectChanged", (entry) => {
        if (match(entry)) bump();
      }),
      events.on("picasaEntryUpdated", ({ entry }) => {
        if (match(entry)) bump();
      }),
      events.on("albumEntryUpdated", (entry) => {
        if (match(entry)) bump();
      }),
      events.on("entryChanged", (entry) => {
        if (match(entry)) bump();
      }),
      events.on("exifDataProcessed", (entry) => {
        if (match(entry)) bump();
      }),
      events.on("albumEntryFileChanged", (entry) => {
        if (match(entry)) bump();
      }),
    ];
    return () => offs.forEach((o) => o());
  }, [page, entriesKey]);

  useEffect(() => {
    if (!page || entries.length === 0) {
      setImageData([]);
      return;
    }
    let cancelled = false;
    albumEntriesWithMetadataAndExif(entries).then((data) => {
      if (!cancelled) setImageData(data);
    });
    return () => { cancelled = true; };
  }, [entries, page, dataTick]);

  useEffect(() => {
    if (page !== "persons" || imageData.length === 0 || !service) return;
    let cancelled = false;
    (async () => {
      const allFaces: { name: string; contactAlbum: any }[] = [];
      for (const entry of imageData) {
        const result = await service.getFaceDataFromAlbumEntry(entry);
        for (const face of result) {
          allFaces.push({ name: (face as any).label ?? (face as any).name ?? "", contactAlbum: (face as any).contact });
        }
      }
      if (!cancelled) setFaces(allFaces);
    })();
    return () => { cancelled = true; };
  }, [page, imageData, service]);

  useEffect(() => {
    if (page !== "location" || !mapContainerRef.current) return;

    if (!mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current);
      L.tileLayer("https://{s}.tile.osm.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://osm.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(mapRef.current);
    }

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const latLongs: [number, number, AlbumEntry][] = [];
    for (const item of imageData) {
      const coords = item.exif;
      if (!coords?.GPSLatitudeRef || !coords?.GPSLongitudeRef) continue;
      const lat = coords.GPSLatitudeRef === "N"
        ? tripletToDecimal(coords.GPSLatitude)
        : -tripletToDecimal(coords.GPSLatitude);
      const lng = coords.GPSLongitudeRef === "W"
        ? -tripletToDecimal(coords.GPSLongitude)
        : tripletToDecimal(coords.GPSLongitude);
      latLongs.push([lat, lng, item]);
    }

    if (latLongs.length === 0) return;

    for (const [lat, lng] of latLongs) {
      const marker = L.marker([lat, lng]);
      markersRef.current.push(marker);
      marker.addTo(mapRef.current!);
    }

    const minLat = Math.min(...latLongs.map((l) => l[0]));
    const maxLat = Math.max(...latLongs.map((l) => l[0]));
    const minLng = Math.min(...latLongs.map((l) => l[1]));
    const maxLng = Math.max(...latLongs.map((l) => l[1]));
    const maxDist = Math.max(maxLat - minLat, maxLng - minLng);
    const zoom = 8 + Math.log2(1 / Math.max(maxDist, 0.001));
    mapRef.current.setView(
      [(minLat + maxLat) / 2, (minLng + maxLng) / 2],
      Math.min(Math.max(zoom, 2), 18),
    );
  }, [page, imageData]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  if (!page) return null;

  return (
    <div className="selection-metadata-pane">
      <div className="selection-metadata-header">
        <span className="selection-metadata-header-title">{t(page)}</span>
        <span className="selection-metadata-header-close" onClick={onClose}>
          ⨯
        </span>
      </div>
      <div className="selection-metadata-content">
        {page === "metadata" && (
          <div className="fill selection-metadata">
            <div className="selection-metadata-list">
              {imageData.map((data, idx) => {
                if (!data.exif) return null;
                const keys = Object.keys(data.exif);
                return (
                  <div key={idx}>
                    <div className="metadata-section-filename">{data.name}</div>
                    {metaSections
                      .filter((s) => s.available.every((a) => keys.includes(a)))
                      .map((section) => (
                        <div key={section.label}>
                          <div className="metadata-section">{t(section.label)}</div>
                          <div className="metadata-section-value">
                            {section.transform(data.exif)}
                          </div>
                        </div>
                      ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {page === "persons" && (
          <div className="fill selection-persons">
            <div className="selection-persons-list">
              {faces.map((face, idx) => (
                <div key={idx} className="selection-person-entry">
                  {face.contactAlbum && (
                    <img
                      className="selection-person-entry-thumb"
                      src={albumThumbnailUrl(face.contactAlbum)}
                      alt={face.name}
                    />
                  )}
                  <span className="selection-person-entry-label">{face.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {page === "location" && (
          <div className="fill selection-location">
            <div
              className="selection-location-map"
              ref={mapContainerRef}
              style={{ width: "100%", height: "100%" }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
