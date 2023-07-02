import { buildEmitter, Emitter } from "../../shared/lib/event";
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
  commit,
  destroyContext,
  encodeToURL,
  resizeContextInside,
  setOptions,
  thumbnailUrl,
  transform,
} from "../imageProcess/client";
import { _$, preLoadImage } from "../lib/dom";
import { ImagePanZoomController } from "../lib/panzoom";
import { getService } from "../rpc/connect";
import { ImageControllerEvent } from "../uiTypes";

export class ImageController {
  constructor(image: _$, video: _$) {
    this.image = image;
    this.video = video;
    this.entry = {
      album: { key: "", name: "", kind: AlbumKind.FOLDER },
      name: "",
      metadata: {},
    };
    this.context = "";
    this.thumbContext = "";
    this.liveContext = "";
    this.events = buildEmitter<ImageControllerEvent>(false);
    this.zoomController = new ImagePanZoomController(this.image);
    this.identify = false;
    this.filters = [];
    this.mute = undefined;
    this.caption = "";
    this.faces = [];
    this.parent = this.image.parent()!;
    this.image.on("load", () => this.loaded());
    new ResizeObserver(async () => {
      await this.recenter();
      this.events.emit("resized", { entry: this.entry, info: this.info() });
    }).observe(this.parent.get()!);
  }

  operationList(): PicasaFilter[] {
    return this.filters;
  }

  private loaded() {
    if (this.image.attr("src")) {
      console.info("Loaded image", this.image.attr("src"));
      this.image.css("display", "");
      this.recenter().then(() => {
        this.events.emit("idle", {});
        this.events.emit("visible", { entry: this.entry, info: this.info() });
      });
    }
  }
  info() {
    return {
      width: this.image.width,
      height: this.image.height,
    };
  }
  operations(): PicasaFilter[] {
    if (this.mute !== undefined) {
      return this.operationList().slice(0, this.mute);
    }
    return this.operationList();
  }

  async muteAt(indexToMute: number) {
    if (this.mute !== indexToMute) {
      this.mute = indexToMute;
      await this.update();
    }
  }
  mutedIndex() {
    return this.mute;
  }
  async unmute() {
    this.mute = undefined;
    await this.update();
  }

  async setIdentifyMode(enable: boolean) {
    if (this.identify !== enable) {
      this.identify = enable;
      await this.update();
    }
  }

  identifyMode() {
    return this.identify;
  }

  async init(albumEntry: AlbumEntryPicasa) {
    this.entry = albumEntry;
    this.display(albumEntry);
    const s = await getService();
    return s.on(
      "albumEntryAspectChanged",
      (e: { payload: AlbumEntryPicasa }) => {
        if (e.payload.name === this.entry.name) {
          // Note ignore event for now, to support A/B edits
          /*
        if(encodeOperations(this.filters) !== e.payload.metadata.filters) {
          this.filters = decodeOperations(e.payload.metadata.filters || '');
          this.update();
        } 
        */
        }
      }
    );
  }

  async display(albumEntry: AlbumEntryPicasa) {
    if (this.context) {
      destroyContext(this.context);
      this.context = "";
    }
    if (this.thumbContext) {
      destroyContext(this.thumbContext);
      this.thumbContext = "";
    }
    this.entry = albumEntry;
    this.events.emit("busy", {});
    this.image.css({ display: "none" });
    this.video.css({ display: "none" });
    this.image.attr("src", null);
    this.video.empty();
    this.faces = [];

    const data = this.entry.metadata;

    this.caption = data.caption || "";
    if (isPicture(this.entry)) {
      this.filters = data.filters ? decodeOperations(data.filters) : [];
      if (this.filterSetupFct) {
        const f = this.filterSetupFct(this.filters);
        if (f) {
          this.filters = f;
          await this.saveFilterInfo();
        }
      }

      // Load the thumbnail first (should already be available)
      const url = thumbnailUrl(this.entry, "th-large");
      this.image.css({ display: "" });
      this.video.css({ display: "none" });
      await preLoadImage(url);
      this.image.attr("src", url);

      // Prepare the image contexts (original and mini version)
      this.context = await buildContext(this.entry);
      this.thumbContext = await cloneContext(this.context, "thumbView");
      await resizeContextInside(this.thumbContext, 300);
      await commit(this.thumbContext);

      this.update(false);
    }
    if (isVideo(this.entry)) {
      this.image.css({ display: "none" });
      this.video.css({ display: "" });
      this.update(false);
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

  /**
   * Update the image with the current filter list
   * @returns
   */
  private async update(progressive: boolean = true) {
    const currentSequence = ++this.updateCount;
    const purge: Function[] = [];
    function cleanup() {
      purge.forEach((f) => f());
    }
    if (isPicture(this.entry)) {
      let thumb: string = "";
      if (progressive) {
        // clear the image immediately
        console.info("clearing image");
        this.image.attr(
          "src",
          "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="
        );
        // Apply the new filter list to the thumbnail image
        thumb = await cloneContext(this.thumbContext, "thumbViewWithFilters");
        purge.push(() => destroyContext(thumb));
        await setOptions(thumb, { caption: this.caption });
        await transform(thumb, this.operations());
        if (currentSequence !== this.updateCount) return cleanup();
        const data = await encodeToURL(thumb, "image/jpeg");
        await preLoadImage(data);
        if (currentSequence !== this.updateCount) return cleanup();

        console.info("showing image thumb");
        this.image.attr("src", data);
      }
      // Apply the new filter list to the live image
      const liveContext = await cloneContext(this.context, "liveView");
      purge.push(() => destroyContext(liveContext));
      await setOptions(liveContext, { caption: this.caption });
      if (this.identify) {
        if (this.faces.length > 0) {
          const faceTransform: string[] = [];
          for (const face of this.faces) {
            faceTransform.push(
              toBase64(JSON.stringify([face.label, face.rect, "#FF0000"]))
            );
          }
          await transform(liveContext, [
            { name: "identify", args: ["1", ...faceTransform] },
          ]);
        }
      }
      if (currentSequence !== this.updateCount) return cleanup();

      await transform(liveContext, this.operations());
      if (currentSequence !== this.updateCount) return cleanup();

      const data = await encodeToURL(liveContext, "image/jpeg");
      await preLoadImage(data);
      if (currentSequence !== this.updateCount) return cleanup();

      console.info("showing real image ");
      this.image.attr("src", data);

      if (this.liveContext) {
        destroyContext(this.liveContext);
      }
      this.liveContext = liveContext;
      if (thumb) destroyContext(thumb);

      this.events.emit("updated", {
        context: this.context,
        liveContext,
        caption: this.caption,
        filters: this.filters,
        entry: this.entry,
      });
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
    await this.saveFilterInfo();
    await this.update();
  }

  async updateCaption(caption: string) {
    this.caption = caption;
    await this.saveCaption();
    await this.update();
  }

  async deleteOperation(idx: number) {
    this.filters.splice(idx, 1);
    await this.saveFilterInfo();
    await this.update();
  }
  async moveDown(idx: number) {
    if (idx < this.filters.length - 1) {
      const op = this.filters.splice(idx, 1)[0];
      this.filters.splice(idx + 1, 0, op);
      await this.saveFilterInfo();
      await this.update();
    }
  }
  async moveUp(idx: number) {
    if (idx > 0) {
      const op = this.filters.splice(idx, 1)[0];
      this.filters.splice(idx - 1, 0, op);
      await this.saveFilterInfo();
      await this.update();
    }
  }

  async updateOperation(idx: number, op: PicasaFilter) {
    if (JSON.stringify(this.filters[idx]) !== JSON.stringify(op)) {
      this.filters[idx] = op;
      await this.saveFilterInfo();
      await this.update();
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

  async recenter() {
    await this.zoomController.recenter();
  }
  async enableZoom(enable: boolean) {
    return this.zoomController.enable(enable);
  }

  zoom(ratio: number) {
    this.zoomController.zoom(ratio);
  }

  getCurrentEntry() {
    return this.entry;
  }

  filterSetup(fct: Function) {
    this.filterSetupFct = fct;
  }

  private image: _$;
  private video: _$;
  private filterSetupFct?: Function;
  private entry: AlbumEntryPicasa;
  private context: string;
  private thumbContext: string;
  private liveContext: string;
  private updateCount: number = 0;
  private filters: PicasaFilter[];
  private caption: string;
  public zoomController: ImagePanZoomController;
  private identify: boolean;
  private parent: _$;
  private mute: number | undefined;
  private faces: FaceData[];
  private previewOperation: PicasaFilter | null = null;
  events: Emitter<ImageControllerEvent>;
}
