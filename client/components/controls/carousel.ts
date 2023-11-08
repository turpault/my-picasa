import { thumbnailUrl } from "../../imageProcess/client";
import { $, _$ } from "../../lib/dom";
import { albumEntryFromId, lessThanEntry } from "../../lib/utils";
import { getService } from "../../rpc/connect";
import {
  AlbumEntrySelectionManager,
  SelectionManager,
} from "../../selection/selection-manager";
import { AlbumEntry, AlbumEntryPicasa } from "../../types/types";

class PicasaCarouselElement extends HTMLElement {
  static observedAttributes = ["entry"];
  private off: Function;
  connectedCallback() {
    this.classList.add("picasa-carousel-element");
    this.updateImage();
  }

  async updateImage() {
    const entry = albumEntryFromId(this.getAttribute("entry"));
    const s = await getService();
    const url = thumbnailUrl(entry, "th-small");
    this.setAttribute("style", `background-image: url("${url}")`);
    this.off = s.on(
      "albumEntryAspectChanged",
      async (e: { payload: AlbumEntryPicasa }) => {
        const changedEntry = e.payload;
        if (lessThanEntry(changedEntry, entry) === 0) {
          this.updateImage();
        }
      }
    );
  }
  attributeChangedCallback(name: string, _oldValue: any, newValue: any) {
    if (name === "entry") {
      this.updateImage();
    }
  }
  disconnectCallback() {
    if (this.off) this.off();
  }
}

class PicasaCarousel extends HTMLElement {
  private activeElement: number = 0;
  private elementCount: number = 0;
  private selection: AlbumEntrySelectionManager | undefined;
  setSelectionList(selection: AlbumEntrySelectionManager) {
    this.selection = selection;
    this.placeElements();
  }
  connectedCallback() {
    this.classList.add("picasa-carousel");
    const leftBtn = $(
      `<button class="carousel-navigation-button stick-left">⬅</button>`
    ).on("click", () => this.goLeft());
    const rightBtn = $(
      `<button class="carousel-navigation-button stick-right">⮕</button>`
    ).on("click", () => this.goRight());
    $(this).append(leftBtn);
    $(this).append(rightBtn);
  }
  createElements() {
    const childs = $(this).all("picasa-carousel-element");
    childs.forEach((c) => c.remove());
    this.selection.selected().forEach((s) => {});
  }
  placeElements() {
    const childs = $(this).all("picasa-carousel-element");
    const center = this.getBoundingClientRect().width / 2;
  }
  goRight() {}
  goLeft() {}
}

export function registerCarousel() {
  window.customElements.define("picasa-carousel", PicasaCarousel);
  window.customElements.define(
    "picasa-carousel-element",
    PicasaCarouselElement
  );
}
