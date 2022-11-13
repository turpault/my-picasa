import { spawn } from "child_process";
import { writeFile } from "fs/promises";
import { basename, dirname, join } from "path";
import { exportsRoot } from "../../utils/constants";

async function runScript(script: string) {
  const scriptName = join(
    exportsRoot,
    "script-" + new Date().toLocaleString().replace(/\//g, "-")
  );
  await writeFile(scriptName, script);
  await new Promise((resolve) =>
    spawn("osascript", [scriptName]).on("close", resolve)
  );
}
export async function importScript(files: string[]) {
  const script = `
set imageList to {
  ${files.map((file) => '"' + file + '" as alias').join(", ")}
}
tell application "Photos"
activate
delay 2
import imageList skip check duplicates yes
end tell
`;
  return runScript(script);
}

export async function openWithFinder(file: string, isFolder: boolean = false) {
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
end tell
  `;
  return runScript(script);
}
