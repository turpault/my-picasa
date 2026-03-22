/**
 * Management /stats page: invoke the same album and media FTS paths as RPC for timing tests.
 */
import type { Album, Filters } from "../../shared/types/types";
import { getAlbums } from "../media";
import { media } from "../rpc/rpcFunctions/albumUtils";

function filtersFromText(text: string): Filters {
  return {
    star: 0,
    video: false,
    people: false,
    persons: [],
    location: false,
    isFavoriteInIPhoto: false,
    text: text.trim(),
  };
}

export async function handleStatsRawApi(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body: {
    op?: string;
    text?: string;
    albumKey?: string;
    albumName?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const op = body.op;
  if (op !== "foldersFts" && op !== "mediaFts") {
    return Response.json(
      { ok: false, error: 'op must be "foldersFts" or "mediaFts"' },
      { status: 400 },
    );
  }

  const text = typeof body.text === "string" ? body.text : "";
  const filters = filtersFromText(text);

  try {
    if (op === "foldersFts") {
      const albums = await getAlbums(filters);
      return Response.json({
        ok: true,
        op,
        albumCount: albums.length,
      });
    }

    const key = body.albumKey;
    if (!key || typeof key !== "string") {
      return Response.json(
        { ok: false, op, error: "mediaFts requires albumKey (string)" },
        { status: 400 },
      );
    }
    const name =
      typeof body.albumName === "string" && body.albumName.length > 0
        ? body.albumName
        : key;
    const album: Album = { key, name };
    const { entries } = await media(album, filters);
    return Response.json({
      ok: true,
      op,
      entryCount: entries.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ ok: false, op, error: message }, { status: 500 });
  }
}
