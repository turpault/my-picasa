import { POI_TYPE } from './poi-types';
import { getRedisClient } from './redis-client';


export async function getLocations(lat: string, long: string) {
  const client = await getRedisClient();
  const idsFromTypes = Object.fromEntries(Object.keys(POI_TYPE).map(v => [POI_TYPE[v as any], v]))
  const types = interestingLocationTypes();
  const areas = interestingLocationAreas();
  const all = [...types, ...areas];

  const res: { loc: string, distance: number, category: string }[] = [];

  await Promise.all(all.map(async idDistPair => {
    const [t, distance] = idDistPair;
    const cat = `locations|${t}`;
    const locations = await client.georadius(cat, long as string, lat as string, distance, "m", "WITHDIST") as string[][];
    const l = locations.map((value) => ({ loc: value[0], category: idsFromTypes[t], distance: parseFloat(value[1]) }));
    if (l.length === 0)
      return;
    l.sort((a, b) => a.distance - b.distance);
    res.push(l[0]);
  }));
  res.sort((a, b) => a.distance - b.distance);
  return res;
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
    [POI_TYPE.POI_VILLAGE, "1000"]] as [number, string][];
}