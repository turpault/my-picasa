import { buildEmitter, Emitter } from "../../shared/lib/event";
import { Queue } from "../../shared/lib/queue";
import {
  decodeOperations,
  encodeOperations,
  isPicture,
  isVideo,
  PicasaFilter,
  toBase64,
} from "../../shared/lib/utils";
import {
  Album,
  AlbumEntryPicasa,
  AlbumKind,
  FaceData,
} from "../../shared/types/types";
import {
  assetUrl,
  buildContext,
  cloneContext,
  destroyContext,
  encodeToURL,
  setOptions,
  thumbnailUrl,
  transform,
} from "../imageProcess/client";
import { preLoadImage, _$ } from "../lib/dom";
import { ImagePanZoomController } from "../lib/panzoom";
import { getService } from "../rpc/connect";
import { ImageControllerEvent } from "../uiTypes";

export class ImageController {
  constructor(image: _$, video: _$, panZoomCtrl: ImagePanZoomController) {
    this.image = image;
    this.video = video;
    this.entry = {
      album: { key: "", name: "", kind: AlbumKind.FOLDER },
      name: "",
      metadata: {},
    };
    this.context = "";
    this.liveContext = "";
    this.events = buildEmitter<ImageControllerEvent>();
    this.zoomController = panZoomCtrl;
    this.q = new Queue(1);
    this.identify = false;
    this.q.event.on("drain", () => {});
    this.filters = [];
    this.mute = -1;
    this.caption = "";
    this.faces = [];
    this.parent = this.image.parent()!;
    this.image.on("load", () => this.loaded());
    new ResizeObserver(() => this.recenter()).observe(this.parent.get()!);
  }

  operationList(): PicasaFilter[] {
    return this.filters;
  }

  private loaded() {
    if (this.image.attr("src")) {
      console.info("Loaded image", this.image.attr("src"));
      this.image.css("display", "");
      this.recenter();
      this.events.emit("idle", {});
    }
  }

  operations(): PicasaFilter[] {
    if (this.mute !== -1) {
      return this.operationList().slice(0, this.mute);
    }
    return this.operationList();
  }

  muteAt(indexToMute: number) {
    if (this.mute !== indexToMute) {
      this.mute = indexToMute;
      this.update();
    }
  }
  muted() {
    return this.mute;
  }

  setIdentifyMode(enable: boolean) {
    if (this.identify !== enable) {
      this.identify = enable;
      this.update();
    }
  }

  identifyMode() {
    return this.identify;
  }

  async rebuildContext(): Promise<boolean> {
    console.info(this.entry.name, "rebuildContext", this.q.length(), "pending");
    this.q.clear();
    this.events.emit("busy", {});
    return this.q.add(async () => {
      console.info(name, "rebuildContext - processed");
      if (this.liveContext) {
        console.info(name, "destroy", this.liveContext);
        await destroyContext(this.liveContext);
      }
      this.liveContext = await cloneContext(this.context, "liveView");
      await setOptions(this.liveContext, { caption: this.caption });

      if (this.identify) {
        if (this.faces.length > 0) {
          const faceTransform: string[] = [];
          for (const face of this.faces) {
            faceTransform.push(
              toBase64(JSON.stringify([face.label, face.rect, "#FF0000"]))
            );
          }
          await transform(this.liveContext, [
            { name: "identify", args: ["1", ...faceTransform] },
          ]);
        }
      }
      await transform(this.liveContext, this.operations());
      return true;
    });
  }

  async init(albumEntry: AlbumEntryPicasa) {
    this.entry = albumEntry;
    this.display(albumEntry);
    const s = await getService();
    return s.on("picasaFileMetaChanged", (e: { payload: AlbumEntryPicasa }) => {
      if (e.payload.name === this.entry.name) {
        // Note ignore event for now, to support A/B edits
        /*
        if(encodeOperations(this.filters) !== e.payload.metadata.filters) {
          this.filters = decodeOperations(e.payload.metadata.filters || '');
          this.update();
        } 
        */
      }
    });
  }

  async display(albumEntry: AlbumEntryPicasa) {
    if (this.context) {
      const context = this.context;
      this.context = "";
      await destroyContext(context);
    }
    this.entry = albumEntry;
    this.events.emit("busy", {});
    this.image.css({ display: "none" });
    this.video.css({ display: "none" });
    this.image.attr("src", null);
    this.video.empty();
    this.faces = [];

    const data = this.entry.metadata;
    this.filters = data.filters ? decodeOperations(data.filters) : [];
    this.caption = data.caption || "";
    if (isPicture(this.entry)) {
      console.info(this.entry.name, "1. display, will build context");
      this.context = await buildContext(this.entry);
      console.info(this.entry.name, "2. display, context built", this.context);
      const url = thumbnailUrl(this.entry, "th-large");
      this.image.css({ display: "" });
      this.video.css({ display: "none" });
      await preLoadImage(url);
      console.info(this.entry.name, "3. Preloaded");
      this.image.attr("src", url);
      this.update();
    }
    if (isVideo(this.entry)) {
      this.image.css({ display: "none" });
      this.video.css({ display: "" });
      this.update();
    }
    this.events.emit("displayed", {});
  }

  async getFaces(): Promise<FaceData[]> {
    if (this.faces.length) {
      return this.faces;
    }
    const faces: FaceData[] = [];
    if (this.entry.metadata.faces) {
      const s = await getService();
      await Promise.all(
        this.entry.metadata.faces.split(";").map(async (face, idx) => {
          const [rect, hash] = face.split(",");
          const faceAlbum = (await s.getFaceAlbumFromHash(hash)) as {
            album: Album;
          };
          if (faceAlbum.album) {
            faces.push({
              album: faceAlbum.album,
              rect,
              hash,
              label: `${idx}: ${faceAlbum.album.name}`,
            });
          }
        })
      );
    }
    this.faces = faces;

    return this.faces;
  }
  async preview(operation: PicasaFilter | null) {
    this.previewOperation = operation;
    if (this.liveContext) {
      if (!operation) {
        const url = await encodeToURL(this.liveContext, "image/jpeg");
        this.image.attr("src", url);
      } else {
        const clone = await cloneContext(this.liveContext, "imageview");
        await transform(clone, [operation]);
        const url = await encodeToURL(clone, "image/jpeg");
        await preLoadImage(url);
        if (this.previewOperation === operation) {
          this.image.attr("src", url);
        }
        destroyContext(clone);
      }
    }
  }

  private async update() {
    const name = this.entry.name;
    if (isPicture(this.entry)) {
      // Only update when the filter list changed
      if (await this.rebuildContext()) {
        const liveContext = this.liveContext;
        console.info(name, "update, context rebuilt");
        this.events.emit("updated", {
          context: this.context,
          liveContext,
          caption: this.caption,
          filters: this.filters,
        });
        this.events.emit("liveViewUpdated", {
          context: liveContext,
          original: this.context,
          entry: this.entry,
        });

        const data = await encodeToURL(liveContext, "image/jpeg");
        await preLoadImage(data);
        console.info(name, "5. Preloaded update");
        this.image.attr("src", data);
      } else {
        console.warn(name, "Context rebuilt abort");
      }
    }
    if (isVideo(this.entry)) {
      this.video
        .empty()
        .append(`<source src="${assetUrl(this.entry)}" type="video/mp4">`);
      const v = this.video.get() as HTMLVideoElement;
      v.load();
      v.play();
    }
  }

  async addOperation(operation: PicasaFilter) {
    this.filters.push(operation);
    await Promise.all([this.saveFilterInfo(), this.update()]);
  }

  async updateCaption(caption: string) {
    this.caption = caption;
    await Promise.all([this.saveCaption(), this.update()]);
  }

  async deleteOperation(idx: number) {
    this.filters.splice(idx, 1);
    await Promise.all([this.saveFilterInfo(), this.update()]);
  }
  async moveDown(idx: number) {
    if (idx < this.filters.length - 1) {
      const op = this.filters.splice(idx, 1)[0];
      this.filters.splice(idx + 1, 0, op);
      await Promise.all([this.saveFilterInfo(), this.update()]);
    }
  }
  async moveUp(idx: number) {
    if (idx > 0) {
      const op = this.filters.splice(idx, 1)[0];
      this.filters.splice(idx - 1, 0, op);
      await Promise.all([this.saveFilterInfo(), this.update()]);
    }
  }

  async updateOperation(idx: number, op: PicasaFilter) {
    if (JSON.stringify(this.filters[idx]) !== JSON.stringify(op)) {
      this.filters[idx] = op;
      await Promise.all([this.saveFilterInfo(), this.update()]);
    }
  }

  async saveFilterInfo() {
    const s = await getService();
    await s.updatePicasaEntry(
      this.entry,
      "filters",
      encodeOperations(this.filters)
    );
  }

  async saveCaption() {
    const s = await getService();
    await s.updatePicasaEntry(this.entry, "caption", this.caption);
  }

  recenter() {
    const h = this.parent.height;
    const w = this.parent.width;
    this.zoomController!.setClientSize(w, h);
    this.zoomController!.recenter();
  }

  getCurrentEntry() {
    return this.entry;
  }

  private image: _$;
  private video: _$;
  private entry: AlbumEntryPicasa;
  private context: string;
  private liveContext: string;
  private filters: PicasaFilter[];
  private caption: string;
  private zoomController?: ImagePanZoomController;
  private q: Queue;
  private identify: boolean;
  private parent: _$;
  private mute: number;
  private faces: FaceData[];
  private previewOperation: PicasaFilter | null = null;
  events: Emitter<ImageControllerEvent>;
}
