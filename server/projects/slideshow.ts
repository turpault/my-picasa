import { mkdir, copyFile } from "fs/promises";
import { tmpdir } from "os";
import { basename, join } from "path";
import { isPicture, uuid } from "../../shared/lib/utils";
import {
  Album,
  AlbumEntry,
  AlbumKind,
  keyFromID,
  SlideshowProject,
} from "../../shared/types/types";
import { getProject } from "../rpc/albumTypes/projects";
import { readAlbumIni } from "../rpc/rpcFunctions/picasa-ini";
import { entryFilePath, safeWriteFile } from "../utils/serverUtils";
import { ffmpeg } from "../videoOperations/ffmpeg";
import {
  buildImage,
  buildNewContext,
  encode,
  transform,
} from "../imageOperations/sharp-processor";
import { ProjectOutAlbumName, ProjectOutputFolder } from "../utils/constants";
import { addOrRefreshOrDeleteAlbum } from "../walker";

export async function generateSlideshowFile(
  projectEntry: AlbumEntry,
  outResolutionX: number,
  outResolutionY: number | undefined,
): Promise<AlbumEntry> {
  const project = (await getProject(projectEntry)) as SlideshowProject;
  const tmpFolder = join(tmpdir(), "slideshow" + uuid());
  await mkdir(tmpFolder, { recursive: true });
  if (outResolutionY === undefined) {
    outResolutionY = (outResolutionX / 16) * 9;
  }
  // Prepare images
  const images: { [id: string]: string } = {};
  const textSize = Math.floor(50 * (outResolutionX / 1920));
  for (const page of project.payload.pages) {
    if (page.type === "image") {
      const entry = page.entry!;
      if (isPicture(entry)) {
        const entryMeta = (await readAlbumIni(entry.album))[entry.name];
        const transform: string[] = [];
        if (page.text)
          transform.push(
            `;label=1,${encodeURIComponent(page.text!)},${textSize},south`,
          );
        const res = await buildImage(
          entry,
          entryMeta,
          entryMeta.filters || "",
          transform,
        );
        const p = join(tmpFolder, page.id + ".jpeg");
        await safeWriteFile(p, res.data);
        images[page.id] = p;
      } else {
        const path = entryFilePath(entry);
        const p = join(tmpFolder, entry.name);
        await copyFile(path, p);
        images[page.id] = p;
      }
    } else if (page.type === "text") {
      const context = await buildNewContext(
        outResolutionX,
        outResolutionY,
        page.bgTextColor || "#000000",
      );
      await transform(
        context,
        `label=1,${encodeURIComponent(page.text!)},${textSize},south,${page.textColor || "#FFFFFF"},${page.bgTextColor || "#000000"}`,
      );
      const jpg = await encode(context, "image/jpeg", "Buffer");
      const p = join(tmpFolder, page.id + ".jpeg");
      await safeWriteFile(p, jpg.data);
      images[page.id] = p;
    }
  }
  // Build command-line
  const imagesWithSequence = project.payload.pages
    .map((e) => {
      return [
        "-loop",
        "1",
        "-t",
        e.delay.toString(),
        "-framerate",
        "60",
        "-i",
        images[e.id]!,
      ];
    })
    .flat();
  const filterResizeArg = project.payload.pages.map(
    (e, i) =>
      `[${i}]scale=${outResolutionX}:${outResolutionY}:force_original_aspect_ratio=decrease,pad=${outResolutionX}:${outResolutionY}:-1:-1[s${i}]`,
  );
  let previousStream = "[s0]";
  let timecode = 0;
  const lastStreamIndex = project.payload.pages.length - 2;
  const filterComplexArg = project.payload.pages.slice(0, -1).map((e, i) => {
    const stream = i === lastStreamIndex ? "" : `[f${i}]`;
    timecode += e.delay;
    if (timecode > 20000 || timecode <= 1) debugger;
    let filter: string = "";
    if (e.transition === "fade") {
      timecode = Math.max(1, timecode - 1); // We need to start the fade one second before the end of the previous image
      filter = `${previousStream}[s${i + 1}]xfade=transition=circleopen:duration=1:offset=${timecode}${stream}`;
    } else if (e.transition === "slider") {
      timecode = Math.max(1, timecode - 1); // We need to start the fade one second before the end of the previous image
      filter = `${previousStream}[s${i + 1}]xfade=transition=slideleft:duration=1:offset=${timecode}${stream}`;
    } else if (e.transition === "smooth") {
      timecode = Math.max(1, timecode - 1); // We need to start the fade one second before the end of the previous image
      filter = `${previousStream}[s${i + 1}]xfade=transition=smoothleft:duration=1:offset=${timecode}${stream}`;
    } else {
      filter = `${previousStream}[s${i + 1}]${stream}`;
    }
    previousStream = stream;
    return filter;
  });

  const command = [
    "-y",
    ...imagesWithSequence,
    "-filter_complex",
    `"${[...filterResizeArg, ...filterComplexArg].join(";")}"`,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "faststart",
  ];

  const name = `${project.name}.mp4`;
  await mkdir(join(ProjectOutputFolder), { recursive: true });
  const out = join(ProjectOutputFolder, name);
  await ffmpeg(command, out);

  const album: Album = {
    name: ProjectOutAlbumName,
    key: keyFromID(ProjectOutAlbumName, AlbumKind.FOLDER),
    kind: AlbumKind.FOLDER,
  };

  return {
    name,
    album,
  };
}
