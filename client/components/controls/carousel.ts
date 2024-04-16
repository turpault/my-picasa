import { compareAlbumEntry, range, uuid } from "../../../shared/lib/utils";
import { thumbnailUrl } from "../../imageProcess/client";
import { $, _$, elementFromEntry, setIdForEntry } from "../../lib/dom";
import { getService } from "../../rpc/connect";
import { AlbumEntrySelectionManager } from "../../selection/selection-manager";
import { AlbumEntry, AlbumEntryPicasa } from "../../types/types";

class PicasaEntryCarouselElement extends HTMLElement {
  connectedCallback() {
    this.classList.add("picasa-carousel-element");
    this.updateImage(undefined);
  }

  async updateImage(entry: AlbumEntry | undefined) {
    this.entry = entry;
    $(this).addRemoveClass("empty", !this.entry);
    if (this.entry) {
      const url = thumbnailUrl(entry, "th-small");
      this.setAttribute("style", `background-image: url("${url}")`);
    } else {
      this.setAttribute("style", "");
    }
  }
  disconnectCallback() {
    if (this.off) this.off();
  }
  private entry: AlbumEntry | undefined;
  private off: Function;
}

export class PicasaEntryCarousel extends HTMLElement {
  static observedAttributes = ["count"];
  private selection: AlbumEntrySelectionManager | undefined;
  private off: Function | undefined;
  setSelectionList(selection: AlbumEntrySelectionManager) {
    if (this.off) this.off();
    this.selection = selection;
    this.createElements();
    const off = [
      this.selection.events.on("activeChanged", (event) => {
        this.place();
      }),
      this.selection.events.on("changed", () => {
        this.createElements();
      }),
    ];
    this.off = () => off.forEach((o) => o());
  }
  connectedCallback() {
    this.classList.add("picasa-carousel");
    this.createElements();
    this.carouselId = uuid();
    getService().then((s) => {
      s.on(
        "albumEntryAspectChanged",
        async (e: { payload: AlbumEntryPicasa }) => {
          const elem = elementFromEntry(e.payload, this.carouselId);
          if (elem.exists()) {
            (elem.get() as PicasaEntryCarouselElement).updateImage(e.payload);
          }
        }
      );
    });
  }
  createElements() {
    const e = $(this);
    e.empty();
    if (!this.selection) return;
    const count = parseInt(this.getAttribute("count"));
    this.leftB = $(
      `<button class="picasa-carousel-navigation-button picasa-carousel-left-button">⬅</button>`
    ).on("click", () => this.goLeft());
    this.rightB = $(
      `<button class="picasa-carousel-navigation-button picasa-carousel-right-button">⮕</button>`
    ).on("click", () => this.goRight());
    const btns = (this.btns = range(count).map(
      (index) =>
        $(
          `<picasa-carousel-element class="strip-btn" loading="lazy"></picasa-carousel-element>`
        )
          .on("click", (e) => {
            this.select(
              parseInt($(e.target as HTMLElement).attr("index")) || 0
            );
          })
          .get() as PicasaEntryCarouselElement
    ));
    e.appendAll([this.leftB, ...btns, this.rightB]);
    this.place();
  }
  select(elementIndex: number) {
    this.selection.setActiveIndex(elementIndex);
  }
  count() {
    return parseInt(this.getAttribute("count") || "1");
  }
  place() {
    const centerElement = Math.floor(this.count() / 2);
    range(this.count()).forEach((index) => {
      const indexInList = index - centerElement + this.selection.activeIndex();
      const entry = this.selection.selected()[indexInList];
      this.btns[index].updateImage(entry);
      if (entry) {
        setIdForEntry($(this.btns[index]), entry, this.carouselId);
      }
      $(this.btns[index])
        .addRemoveClass("selected", index === centerElement)
        .attr("index", indexInList);
    });
    this.leftB.addRemoveClass("disabled", this.selection.activeIndex() === 0);
    this.rightB.addRemoveClass(
      "disabled",
      this.selection.activeIndex() === this.selection.selected().length - 1
    );
  }
  attributeChangedCallback(name: string, _oldValue: any, newValue: any) {
    if (name === "count") {
      this.createElements();
    }
  }
  goRight() {
    this.selection.setActiveNext();
  }
  goLeft() {
    this.selection.setActivePrevious();
  }
  private btns: PicasaEntryCarouselElement[] = [];
  private leftB: _$;
  private rightB: _$;
  private carouselId: string;
}

export function registerCarousel() {
  window.customElements.define("picasa-carousel", PicasaEntryCarousel);
  window.customElements.define(
    "picasa-carousel-element",
    PicasaEntryCarouselElement
  );
}
