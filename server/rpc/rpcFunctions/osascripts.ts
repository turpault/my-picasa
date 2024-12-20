import { spawn } from "child_process";
import { info } from "console";
import csv from "csv-parser";
import { writeFile } from "fs/promises";
import { basename, dirname, join, relative } from "path";
import { Readable } from "stream";
import { exportsFolder, rootPath } from "../../utils/constants";

async function runScript(
  script: string,
  processor: "osascript" | "bash" = "osascript",
  stream: boolean = false,
  cb?: (line: string) => Promise<boolean | undefined>,
): Promise<string | Readable> {
  const scriptName = join(
    exportsFolder,
    "script-" + new Date().toLocaleString().replace(/\//g, "-"),
  );
  info("Running script", scriptName);
  await writeFile(scriptName, script);
  return new Promise((resolve, reject) => {
    const stdoutData: string[] = [];
    const proc = spawn(processor, [scriptName]);
    proc.on("close", () => resolve(stdoutData.join("")));
    proc.on("error", (e) => reject(e));
    const s = processor === "osascript" ? proc.stderr : proc.stdout;
    if (stream) {
      return resolve(s);
    }
    s.on("data", (data: Buffer) => {
      const str = data
        .toString("utf-8")
        .split("\n")
        .filter((s) => s.length > 0);
      if (cb) {
        Promise.all(str.map((line) => cb(line))).then((res) => {
          if (res.includes(false)) {
            // Abort the execution of the script
            proc.kill();
          }
        });
      }
      stdoutData.push(...str);
    });
  });
}
export async function importScript(files: string[]) {
  const script = `
set imageList to {}
${files
  .map(
    (file) =>
      'copy (POSIX FILE "' + file + '") as alias to the end of |imageList|',
  )
  .join("\n")}
tell application "Photos"
activate
delay 2
import imageList skip check duplicates yes
end tell
`;
  return runScript(script);
}

export async function openWithFinder(file: string, isFolder: boolean = false) {
  // Use "open"
  if (isFolder) {
    return spawn("/usr/bin/open", [file]);
  } else {
    const directory = isFolder ? file : dirname(file);
    const f = basename(file);
    const script = `
tell application "Finder"
	set the_folder to (POSIX file "${directory}") as alias  
	open the_folder
  ${
    !isFolder
      ? `select (every item of the_folder whose name is in ["${f}"])`
      : ""
  }	
  activate
end tell
  `;
    return runScript(script);
  }
}
export type PhotoFromPhotoApp = {
  name: string;
  dateTaken: Date;
  caption: string;
  keywords: string;
  title: string;
  id: string;
  favorite: boolean;
  persons: string[];
};

export async function getPhotoFavorites(
  progress: (photo: PhotoFromPhotoApp, index: number, total: number) => void,
): Promise<string[]> {
  const script = `
tell application "Photos"
	set albumPhotos to every media item in favorites album
	set c to count of albumPhotos
	log c
	
	repeat with thisPhoto in albumPhotos
		set PhotoCaption to description of thisPhoto as string
		set PhotoTitle to name of thisPhoto as string
		set PhotoFileName to filename of thisPhoto as string
		set PhotoID to id of thisPhoto as string
		set PhotoDate to date of thisPhoto
    set dateISO to (PhotoDate as «class isot» as string)
    set {year:y, month:m, day:d} to PhotoDate
		set PhotoKeywords to keywords of thisPhoto as string
		log PhotoCaption & "|" & PhotoTitle & "|" & PhotoFileName & "|" & PhotoID & "|" & dateISO & "|" & PhotoKeywords 
	end repeat
end tell
    `;
  let total = -1;
  let index = 0;

  const result = await runScript(script, "osascript", false, async (line) => {
    if (total === -1) {
      total = parseInt(line);
      return true;
    }
    const [caption, title, name, id, isoDate, keywords] = line.split("|");
    index++;
    if (!name) {
      return true;
    }
    if (caption && caption.startsWith("PICISA:")) {
      // Favorite that was reimported from PICISA
      return true;
    }

    try {
      await progress(
        {
          caption,
          title,
          name,
          id,
          favorite: true,
          persons: [],
          keywords,
          dateTaken: new Date(isoDate),
        },
        index,
        total,
      );
    } catch (e) {
      console.warn(`Aborting script because ${e}`);
      return false;
    }
    return true;
  });
  return (result as string).split("\n");
}
export async function getOsxPhotosDump(
  progress: (photo: PhotoFromPhotoApp, index: number, total: number) => void,
) {
  let total = 0;
  let index = 0;

  const stream = await runScript(
    `"${join(rootPath, "public", "resources", "tools", "osxphotos")}" dump`,
    "bash",
    true,
  );
  return new Promise<void>((resolve) => {
    (stream as Readable)
      .pipe(csv())
      .on("data", (row) => {
        total++;
        index++;
        progress(
          {
            caption: row.description,
            title: row.title,
            name: row.original_filename,
            id: row.uuid,
            favorite: row.favorite === "True",
            persons: row.persons.split(","),
            keywords: row.keywords,
            dateTaken: new Date(row.date),
          },
          index,
          total,
        );
      })
      .on("end", () => {
        console.log("CSV file successfully processed");
        resolve();
      });
  });
}
