import { albumEntryIndexInList, isVideoUrl } from "../../shared/lib/utils.js";
import { getAlbumInfo } from "../folder-utils.js";
import { assetUrl, thumbnailUrl } from "../imageProcess/client.js";
import { $ } from "../lib/dom.js";
import { Album, AlbumEntry, AlbumListEventSource } from "../types/types.js";
import { deleteTabWin } from "./tabs.js";

export async function makeGallery(
  start: AlbumEntry,
  events: AlbumListEventSource
): Promise<HTMLElement> {
  const info = await getAlbumInfo(start.album, true /* use settings */);
  const thumbs = info.assets.map((asset) => thumbnailUrl(asset));
  const urls = info.assets.map((asset) => assetUrl(asset));
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
  <img class="gallery-demo gallery-cursor" src="${thumb}" action="slide:${idx}" alt="${info.assets[idx].name}">
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
  var slideIndex = albumEntryIndexInList(start, info.assets);
  showSlides(slideIndex);
  events.on("keyDown", ({ code, win }) => {
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
  });

  function showSlides(n: number) {
    if (n >= urls.length) {
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
  return e.get();
}
