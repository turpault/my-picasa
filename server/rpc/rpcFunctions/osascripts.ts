import { spawn } from "child_process";
import { writeFile } from "fs/promises";
import { basename, dirname, join } from "path";
import { exportsFolder } from "../../utils/constants";

async function runScript(script: string) {
  const scriptName = join(
    exportsFolder,
    "script-" + new Date().toLocaleString().replace(/\//g, "-")
  );
  await writeFile(scriptName, script);
  await new Promise((resolve) =>
    spawn("osascript", [scriptName]).on("close", resolve)
  );
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
    spawn("/usr/bin/open", [file]);
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
