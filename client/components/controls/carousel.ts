import { compareAlbumEntry, range } from "../../../shared/lib/utils";
import { thumbnailUrl } from "../../imageProcess/client";
import { $, _$ } from "../../lib/dom";
import { getService } from "../../rpc/connect";
import { AlbumEntrySelectionManager } from "../../selection/selection-manager";
import { AlbumEntry, AlbumEntryPicasa } from "../../types/types";

class PicasaEntryCarouselElement extends HTMLElement {
  connectedCallback() {
    this.classList.add("picasa-carousel-element");
    this.updateImage(undefined);
    getService().then((s) => {
      this.off = s.on(
        "albumEntryAspectChanged",
        async (e: { payload: AlbumEntryPicasa }) => {
          const changedEntry = e.payload;
          if (this.entry && compareAlbumEntry(changedEntry, this.entry) === 0) {
            this.updateImage(this.entry);
          }
        }
      );
    });
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
  setSelectionList(selection: AlbumEntrySelectionManager) {
    this.selection = selection;
    this.createElements();
    this.selection.events.on("activeChanged", (event) => {
      this.place();
    });
    this.selection.events.on("added", () => this.createElements());
    this.selection.events.on("removed", () => this.createElements());
  }
  connectedCallback() {
    this.classList.add("picasa-carousel");
    this.createElements();
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
          .on("click", () => {
            this.select(index);
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
      this.btns[index].updateImage(this.selection.selected()[indexInList]);
      $(this.btns[index]).addRemoveClass("selected", index === centerElement);
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
}

export function registerCarousel() {
  window.customElements.define("picasa-carousel", PicasaEntryCarousel);
  window.customElements.define(
    "picasa-carousel-element",
    PicasaEntryCarouselElement
  );
}
