import { readdir, readFile, stat, writeFile } from "fs/promises";
import { join } from "path";
import ini from "../../../shared/lib/ini";
import { fileExists } from "../../utils/serverUtils";

async function walkIniFiles(path: string, cb: (path: string) => {}) {
  const walker = async (p: string, cb: (file: string) => {}) => {
    const fullRelPath = join(path, p);
    const files = await readdir(fullRelPath);
    for (const file of files) {
      const filePath = join(fullRelPath, file);
      const stats = await stat(filePath);
      const r = join(p, file);
      if (stats.isDirectory() && !file.startsWith(".")) {
        await walker(r, cb);
      } else if (file.endsWith(".ini")) {
        cb(r);
      }
    }
  };
  await walker("", cb);
}

function deepMerge(obj1: any, obj2: any) {
  const result = { ...obj1 };
  for (const [key, value] of Object.entries(obj2)) {
    if (typeof value === "object" && !Array.isArray(value)) {
      if (
        result[key] &&
        typeof result[key] === "object" &&
        !Array.isArray(result[key])
      ) {
        result[key] = deepMerge(result[key], value);
      } else {
        result[key] = value;
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}

async function recoverIniFileByMerge(path: string[], mergePath: string) {
  return walkIniFiles(mergePath, async (file) => {
    const m1 = join(mergePath, file);
    let f = false;
    let ini1 = ini.parse(await readFile(m1, { encoding: "utf-8" }));
    for (const p of path) {
      const m2 = join(p, file);
      if (await fileExists(m2)) {
        const ini2 = ini.parse(await readFile(m2, { encoding: "utf-8" }));
        f = true;
        ini1 = deepMerge(ini1, ini2);
      }
    }
    if (f) await writeFile(m1, ini.stringify(ini1));
  });
}

recoverIniFileByMerge(
  [
    "/Volumes/4TB/Photos/backup/\\2024-\\06-\\10",
    "/Volumes/4TB/Photos/backup/\\2024-\\06-\\12",
    "/Volumes/4TB/Photos/backup/\\2024-\\06-\\13",
    "/Volumes/4TB/Photos/backup/\\2024-\\06-\\18",
    "/Volumes/4TB/Photos/backup/\\2024-\\06-\\20",
    "/Volumes/4TB/Photos/backup/\\2024-\\06-\\23",
    "/Volumes/4TB/Photos/backup/\\2024-\\08-\\17",
    "/Volumes/4TB/Photos/backup/\\2024-\\08-\\20",
    "/Volumes/4TB/Photos/backup/\\2024-\\08-\\23",
    "/Volumes/4TB/Photos/backup/\\2024-\\08-\\25",
  ],
  "/Volumes/Photos/Photos",
);
