import { copyFile, mkdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { isPicture, namify, uuid } from "../../shared/lib/utils";
import { Album, AlbumEntry, SlideshowProject } from "../../shared/types/types";
import {
  blit,
  buildContextFromBuffer,
  buildImage,
  buildNewContext,
  destroyContext,
  encode,
  transform,
} from "../imageOperations/sharp-processor";
import { getProject } from "../rpc/albumTypes/projects";
import { getPicasaEntry } from "../rpc/rpcFunctions/picasa-ini";
import { imagesRoot } from "../utils/constants";
import {
  entryFilePath,
  pathForAlbum,
  safeWriteFile,
} from "../utils/serverUtils";
import { ffmpeg } from "../videoOperations/ffmpeg";

export async function generateSlideshowFile(
  projectEntry: AlbumEntry,
  outAlbum: Album,
  outResolutionX: number,
  outResolutionY: number | undefined,
): Promise<AlbumEntry> {
  const project = (await getProject(projectEntry)) as SlideshowProject;
  const tmpFolder = join(tmpdir(), "slideshow" + uuid());
  console.warn(`Generating slideshow in ${tmpFolder}`);
  await mkdir(tmpFolder, { recursive: true });
  if (outResolutionY === undefined) {
    outResolutionY = (outResolutionX / 16) * 9;
  }
  // Prepare images
  const images: { [id: string]: string } = {};
  const textSize = 36;
  let previous: Buffer | undefined;
  for (const page of project.payload.pages) {
    if (page.type === "image") {
      const entry = page.entry!;
      if (isPicture(entry)) {
        const entryMeta = await getPicasaEntry(entry);
        let filters = entryMeta.filters || "";
        if (page.text && page.border !== "polaroid")
          filters += `;label=1,${encodeURIComponent(page.text!)},${textSize},s`;
        switch (page.border) {
          case "none":
            break;
          case "simple":
            filters += ";border=1,3,#FFFFFF";
            break;
          case "wide":
            filters += ";border=1,6,#FFFFFF";
            break;
          case "polaroid":
            filters += `;Polaroid=1,0,#FFFFFF,${encodeURIComponent(page.text || "")}`;
            break;
        }
        filters += `;resize=1,${outResolutionX},${outResolutionY}`;
        let res = await buildImage(entry, entryMeta, filters, []);
        if (page.transition === "pile" && previous) {
          // Find position in previous image
          const rotation = Math.random() * 60 - 30;
          const scale = 0.5;
          const corners = [
            [(res.width * scale) / 2, (res.height * scale) / 2],
            [(-res.width * scale) / 2, (res.height * scale) / 2],
            [(res.width * scale) / 2, (-res.height * scale) / 2],
            [(-res.width * scale) / 2, (-res.height * scale) / 2],
          ];
          const rotatedCorners = corners.map(([x, y]) => [
            x * Math.cos(rotation) - y * Math.sin(rotation),
            x * Math.sin(rotation) + y * Math.cos(rotation),
          ]);
          const minX = Math.max(
            0,
            Math.min(...rotatedCorners.map(([x, _]) => x)),
          );
          const minY = Math.max(
            0,
            Math.min(...rotatedCorners.map(([_, y]) => y)),
          );
          const maxX = Math.min(
            res.width,
            Math.max(...rotatedCorners.map(([x, _]) => x)),
          );
          const maxY = Math.min(
            res.height,
            Math.max(...rotatedCorners.map(([_, y]) => y)),
          );
          const width = maxX - minX;
          const height = maxY - minY;

          const maxTransX = outResolutionX - width;
          const maxTransY = outResolutionY - height;
          // Using a random translation, with a uniform distribution
          const p = maxTransX * maxTransY * Math.random();
          const transX = Math.floor((p % maxTransX) + minX);
          const transY = Math.floor(p / maxTransX + minY);
          const context = await buildContextFromBuffer(previous!);
          const rotated = await buildContextFromBuffer(res.data);
          await transform(
            rotated,
            `scale=1,${scale};alpha=1;rotateAngle=1,${rotation},#00000000`,
          );
          // Add the image to the previous one
          const previousContext = await buildContextFromBuffer(previous!);
          await blit(previousContext, rotated, transX, transY);
          const jpg = await encode(previousContext, "image/jpeg", "Buffer");
          Object.assign(res, jpg);
          destroyContext(context);
          destroyContext(previousContext);
        }

        // Resize the image to fit the output resolution
        if (res.width !== outResolutionX || res.height !== outResolutionY) {
          const context = await buildContextFromBuffer(res.data);
          await transform(
            context,
            `into=1,${outResolutionX},${outResolutionY},${page.bgTextColor || "#000000"}`,
          );
          const jpg = await encode(context, "image/jpeg", "Buffer");
          destroyContext(context);
          Object.assign(res, jpg);
        }
        const p = join(tmpFolder, page.id + ".jpeg");
        await safeWriteFile(p, res.data);
        images[page.id] = p;
        previous = res.data;
      } else {
        const path = entryFilePath(entry);
        const p = join(tmpFolder, entry.name);
        await copyFile(path, p);
        images[page.id] = p;
        previous = undefined;
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
      previous = jpg.data! as Buffer;
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
      filter = `${previousStream}[s${i + 1}]concat=n=2${stream}`;
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

  const targetFile =
    namify(
      `${project.name
      } ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
    ) + ".mp4";

  const p = join(imagesRoot, pathForAlbum(outAlbum));
  await mkdir(p, { recursive: true });
  const out = join(p, targetFile);
  await ffmpeg(command, out);

  return {
    name: targetFile,
    album: outAlbum,
  };
}
