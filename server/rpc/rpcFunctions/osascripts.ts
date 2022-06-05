export function importScript(files: string[]) {
  return `
set imageList to {
  ${files.map(file=>'"'+file+'" as alias').join(", ")}
}
tell application "Photos"
activate
delay 2
import imageList skip check duplicates yes
end tell
`;
}
