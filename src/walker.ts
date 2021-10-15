export async function walk(
  dir: any,
  cb: Function,
  parent: string = ""
): Promise<void> {
  const lst: { name: string; kind: string; handle: any }[] = [];
  // Get the directory contents
  for await (const [name, handle] of dir) {
    lst.push({ name, handle, kind: handle.kind });
  }
  // Directory first, directories are reverse sorted, files are sorted
  const sorted = lst.sort((a, b) => {
    if (a.kind != b.kind) {
      if (a.kind == "directory") {
        return -1;
      }
      if (b.kind == "directory") {
        return 1;
      }
    }
    let m = 1;
    if (a.kind === "directory" && a.kind === b.kind) {
      m = -1;
    }
    const la = a.name.toLowerCase();
    const lb = b.name.toLowerCase();
    return la < lb ? -m : la > lb ? m : 0;
  });
  // Only notify that the current folder is a dir if it contains pictures
  const images = ["jpeg", "jpg", "png", "gif"];
  const pictures = sorted.filter((a) => {
    const ext = a.name.split(".").pop()!.toLowerCase();
    return a.kind === "file" && images.includes(ext) && !a.name.startsWith(".");
  });
  if (pictures.length > 0) {
    await cb("directory", {
      path: parent,
      name: dir.name,
      handle: dir,
      pictures,
    });
  }

  // enumerate subfolders
  for (const { name, handle, kind } of sorted) {
    const path = parent + "/" + name;
    if (kind == "directory" && name.substr(0, 1) !== ".") {
      await walk(handle, cb, path);
    }
  }
}
