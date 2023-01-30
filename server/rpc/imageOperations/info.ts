import { isPicture, isVideo } from "../../../shared/lib/utils";
import {
  AlbumEntry,
  AlbumEntryWithMetadata,
  Filetype,
} from "../../../shared/types/types";
import {
  readAlbumIni,
  updatePicasaEntries,
  updatePicasaEntry,
} from "../rpcFunctions/picasaIni";
import {
  buildContext,
  destroyContext,
  encode,
  setOptions,
  transform,
} from "./sharp-processor";

export async function imageInfo(
  entry: AlbumEntry
): Promise<AlbumEntryWithMetadata> {
  const res: AlbumEntryWithMetadata = {
    ...entry,
    meta: { transform: "", type: Filetype.Picture, width: 0, height: 0 },
  };
  const picasa = await readAlbumIni(entry.album);
  const options = picasa[entry.name] || {};
  if (isVideo(entry)) {
    res.meta.type = Filetype.Video;
  } else if (isPicture(entry)) {
    res.meta.type = Filetype.Picture;

    if (
      options.dimensions &&
      options.dimensionsFromFilter === options.filters
    ) {
      const [w, h] = options.dimensions.split("x");
      res.meta.width = parseInt(w);
      res.meta.height = parseInt(h);
    } else {
      const context = await buildContext(entry);
      await setOptions(context, options);
      if (options.filters) {
        await transform(context, options.filters!);
      }
      const encoded = await encode(context);
      res.meta.width = encoded.width;
      res.meta.height = encoded.height;
      await destroyContext(context);
      updatePicasaEntries(entry, {
        dimensions: `${encoded.width}x${encoded.height}`,
        dimensionsFromFilter: options.filters,
      });
    }
    res.meta.transform = options.filters;
  }
  return res;
}
