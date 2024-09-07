import { Redis } from "ioredis";


export async function getRedisClient() {
  const self = getRedisClient as any;
  self._instance = self._instance || new Redis()
  return self._instance as Redis;
}
