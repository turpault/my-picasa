import { buildEmitter } from "../../shared/lib/event";
import { isVideoUrl } from "../../shared/lib/utils";
import { AlbumEntry } from "../../shared/types/types";
import { assetUrl, thumbnailUrl } from "../imageProcess/client";
import { $, _$ } from "../lib/dom";
import {
  AlbumEntrySelectionManager,
  SelectionManager,
} from "../selection/selection-manager";
import { AppEventSource } from "../uiTypes";
import { TabEvent, deleteTabWin, makeGenericTab } from "./tabs";

export async function makeGallery(
  initialIndex: number,
  initialList: AlbumEntry[],
  appEvents: AppEventSource
): Promise<{ win: _$; tab: _$; selectionManager: AlbumEntrySelectionManager }> {
  const thumbs = initialList.map((asset) => thumbnailUrl(asset));
  const urls = initialList.map((asset) => assetUrl(asset));
  const e = $(`
  <div class="gallery-container">
  <div class="gallery-mySlides">
    <div class="gallery-numbertext"></div>
    <video autoplay muted loop controls class="gallery-main-video">
      <!--<source src="" type="video/mp4">-->
    </video>
    <img loading="lazy" class="gallery-main-pic">
  </div>
  <!-- Next and previous buttons -->
  <a class="gallery-prev" action="plusSlides">&#10094;</a>
  <a class="gallery-next" action="minusSlides">&#10095;</a>
  <!-- Image text -->
  <div class="caption-container">
    <p class="gallery-caption"></p>
  </div>
  <!-- Thumbnail images -->
  <div class="gallery-row">
  ${thumbs
    .map(
      (thumb, idx) => `
  <img class="gallery-demo gallery-cursor" src="${thumb}" action="slide:${idx}" alt="${initialList[idx].name}">
  `
    )
    .join("\n")}
  </div>`);
  const pic = $(".gallery-main-pic", e).centerOnLoad();
  const vid = $(".gallery-main-video", e);

  e.on("click", (ev: MouseEvent) => {
    const action = $(ev.target as HTMLElement).attr("action");
    if (action) {
      switch (action) {
        case "plusSlides":
          showSlides((slideIndex += 1));
          break;
        case "minusSlides":
          showSlides((slideIndex -= 1));
          break;
        default:
          const d = action.split(":");
          if (d[0] === "slide") {
            showSlides(parseInt(d[1]));
          }
      }
    }
  });
  const elem = e.get();
  var slideIndex = initialIndex;
  showSlides(slideIndex);
  const off = [
    appEvents.on("keyDown", ({ code, win }) => {
      switch (code) {
        case "Escape":
          deleteTabWin(win);
          break;
        case "ArrowLeft":
          showSlides(slideIndex - 1);
          break;
        case "ArrowRight":
          showSlides(slideIndex + 1);
          break;
      }
    }),
    appEvents.on("tabDeleted", ({ win }) => {
      if (win.get() === e.get()) {
        off.forEach((o) => o());
      }
    }),
  ];

  function showSlides(n: number) {
    if (n >= urls.length || n < 0) {
      slideIndex = 0;
    } else if (n < 0) {
      slideIndex = urls.length - 1;
    } else {
      slideIndex = n;
    }
    const asset = urls[slideIndex];
    if (isVideoUrl(asset)) {
      pic.css("display", "none");
      vid.css("display", "block");
      vid.empty().append(`<source src="${asset}" type="video/mp4">`);
      (vid.get() as HTMLVideoElement).load();
      (vid.get() as HTMLVideoElement).play();
    } else {
      pic.css("display", "block");
      vid.css("display", "none");
      pic.attr("src", asset);
    }

    var dots = elem.getElementsByClassName(
      "gallery-demo"
    ) as HTMLCollectionOf<HTMLImageElement>;
    for (let i = 0; i < dots.length; i++) {
      dots[i].className = dots[i].className.replace(" active", "");
    }
    dots[slideIndex].className += " active";
  }
  const tabEvent = buildEmitter<TabEvent>();
  tabEvent.emit("rename", { name: "Gallery" });
  return {
    win: e,
    tab: makeGenericTab(tabEvent),
    selectionManager: new SelectionManager(),
  };
}
