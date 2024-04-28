import { spawn } from "child_process";
import { info } from "console";
import { writeFile } from "fs/promises";
import { basename, dirname, join } from "path";
import { exportsFolder } from "../../utils/constants";

async function runScript(
  script: string,
  cb?: (line: string) => Promise<boolean | undefined>
): Promise<string> {
  const scriptName = join(
    exportsFolder,
    "script-" + new Date().toLocaleString().replace(/\//g, "-")
  );
  info("Running script", scriptName);
  await writeFile(scriptName, script);
  return new Promise((resolve, reject) => {
    const stdoutData: string[] = [];
    const proc = spawn("osascript", [scriptName]);
    proc.stderr.on("data", (data: Buffer) => {
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

    proc.on("close", () => resolve(stdoutData.join("")));
    proc.on("error", (e) => reject(e));
  });
}
export async function importScript(files: string[]) {
  const script = `
set imageList to {}
${files
  .map(
    (file) =>
      'copy (POSIX FILE "' + file + '") as alias to the end of |imageList|'
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
export type PhotoFromPhotoApp = { name: string; dateTaken: Date };
export async function getPhotoFavorites(
  progress: (photo: PhotoFromPhotoApp, index: number, total: number) => void
): Promise<string[]> {
  const script = `
  tell application "Photos"
          log (count every media item of album "favorites") 
          repeat with p in (every media item in album named "favorites")
                  log "---"
                  log  (filename of p as string)
                  set {year:y, month:m, day:d} to (date of p)
                  set shortDate to y &  m  & d
                  log shortDate
          end repeat
  end tell
    `;
  let total = -1;
  let name = "";
  let index = 0;

  const result = await runScript(script, async (line) => {
    if (total === -1) {
      total = parseInt(line);
      return true;
    }
    if (line === "---") {
      name = "";
      return true;
    }
    if (name === "") {
      name = line;
      return true;
    }
    // it's the date
    let [year, month, day] = line.split(",");
    const dateTaken = new Date(`${year} ${month} ${day}`);

    try {
      index++;
      await progress({ name, dateTaken }, index, total);
      name = "";
    } catch (e) {
      console.warn(`Aborting script because ${e}`);
      return false;
    }
    return true;
  });
  return result.split("\n");
}
