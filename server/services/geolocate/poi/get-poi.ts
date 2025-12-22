import { GeoPOI } from "../../../../shared/types/types";
import { POI_TYPE } from "./poi-types";
import { getPoiDb } from "./sqlite-client";
// import ts-2d-geometry for distance calculation if needed, 
// but implementing simple Haversine formula is sufficient and lighter.

export async function getLocations(
  lat: number,
  long: number,
): Promise<GeoPOI[]> {
  const db = getPoiDb();
  const idsFromTypes = Object.fromEntries(
    Object.keys(POI_TYPE).map((v) => [POI_TYPE[v as any], v]),
  );

  const types = interestingLocationTypes();
  const areas = interestingLocationAreas();
  // Combine all types and their max distances
  const allCriteria = [...types, ...areas];

  // Find the maximum distance we are interested in to limit the SQL query
  const maxDistance = Math.max(...allCriteria.map(c => parseInt(c[1])));

  // Approximate conversion: 1 degree latitude ~ 111km
  // 1 degree longitude varies by latitude, but max is ~111km at equator.
  // We use a bounding box for the SQL query to efficiently filter candidates using the index.
  // Adding a buffer factor for safety.
  const latDelta = (maxDistance / 111000) * 1.5;
  const lonDelta = (maxDistance / (111000 * Math.cos(lat * (Math.PI / 180)))) * 1.5;

  const minLat = lat - latDelta;
  const maxLat = lat + latDelta;
  const minLon = long - lonDelta;
  const maxLon = long + lonDelta;

  const typeIds = allCriteria.map(c => c[0]);

  const query = `
    SELECT type, lat, lon, label
    FROM poi
    WHERE lat BETWEEN ? AND ?
      AND lon BETWEEN ? AND ?
      AND type IN (${typeIds.join(',')})
  `;

  const candidates = db.prepare(query).all(minLat, maxLat, minLon, maxLon) as {
    type: number;
    lat: number;
    lon: number;
    label: string;
  }[];

  const res: { loc: string; distance: number; category: string }[] = [];

  for (const candidate of candidates) {
    const dist = getDistanceFromLatLonInM(lat, long, candidate.lat, candidate.lon);

    // Find the matching criteria for this type
    const criteria = allCriteria.find(c => c[0] === candidate.type);

    if (criteria) {
      const maxDistForType = parseInt(criteria[1]);
      if (dist <= maxDistForType) {
        res.push({
          loc: candidate.label,
          category: idsFromTypes[candidate.type],
          distance: dist
        });
      }
    }
  }

  // Deduplicate by location name, keeping the closest one if duplicates exist
  const uniqueRes: { [key: string]: typeof res[0] } = {};
  for (const r of res) {
    if (!uniqueRes[r.loc] || uniqueRes[r.loc].distance > r.distance) {
      uniqueRes[r.loc] = r;
    }
  }

  const sortedRes = Object.values(uniqueRes).sort((a, b) => a.distance - b.distance);

  // If we want only the closest one per category type (optional, based on previous logic seems like we returned closest per query batch)
  // The previous logic returned `res.push(l[0])` for each type/dist pair query.
  // Here we collected all, so we might want to filter similar logic.

  // Group by category and pick closest?
  // The previous implementation did `res.push(l[0])` inside the map loop over `all`.
  // This means for each (type, dist) tuple, it found closest locations and took the very closest one.

  const finalRes: typeof res = [];
  const processedTypes = new Set<number>();

  // We need to match the "closest per requested type/area" behavior
  for (const [typeId, maxDistStr] of allCriteria) {
    const maxDist = parseInt(maxDistStr);

    // Find closest candidate of this type within maxDist
    let closest: typeof res[0] | null = null;

    for (const candidate of candidates) {
      if (candidate.type === typeId) {
        const dist = getDistanceFromLatLonInM(lat, long, candidate.lat, candidate.lon);
        if (dist <= maxDist) {
          if (!closest || dist < closest.distance) {
            closest = {
              loc: candidate.label,
              category: idsFromTypes[typeId],
              distance: dist
            };
          }
        }
      }
    }

    if (closest) {
      finalRes.push(closest);
    }
  }

  finalRes.sort((a, b) => a.distance - b.distance);
  return finalRes;
}

function getDistanceFromLatLonInM(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000; // Radius of the earth in m
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in m
  return d;
}

function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}

function interestingLocationTypes() {
  const types: [number, string][] = [];
  for (const name in POI_TYPE) {
    if (name.startsWith("TOURIST")) {
      types.push([POI_TYPE[name] as any, "100"]);
    }
  }
  return types;
}
function interestingLocationAreas() {
  return [
    [POI_TYPE.POI_CITY, "3000"],
    [POI_TYPE.POI_HAMLET, "1000"],
    [POI_TYPE.POI_TOWN, "3000"],
    [POI_TYPE.POI_VILLAGE, "1000"],
  ] as [number, string][];
}
