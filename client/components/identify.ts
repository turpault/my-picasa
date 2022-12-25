import { ImageController } from "../components/image-controller";
import { $, _$ } from "../lib/dom";
import { t } from "./strings";

const identiyHTML = `
<div>
  <div class="identity-panel">
    <label class="inline-label">${t("Show/Hide Identification")}</label>
    <input type="checkbox" class="identify-toggle">
  </div>
  <div class="identify-faces"></div>
</div>
`;
export function makeIdentify(
  e: _$,
  controller: ImageController
) {
  const identifySidebar = $(identiyHTML);
  e.append(identifySidebar);

  const faceList = $('.identify-faces',e);
  const toggle = $(".identify-toggle", identifySidebar);
  //const faces = $(".identify-faces", identifySidebar);
  toggle.val(controller.identifyMode()?"true":"false");
  toggle.on('change', () => {
    controller.setIdentifyMode(toggle.val()==="true");
  });  
  controller.events.on('faceUpdated', ()=> {
    toggle.val(controller.identifyMode()?"true":"false");
    const faces = controller.getFaces();
    faceList.empty();
    for(const face of faces) {
      faceList.append(`<div class="identify-face">${face.label}<a href="#" class="identify-face-remove">${t("Remove")}</a></div>`);
    }
  });
}


/*

        const entry = imageController.currentEntry();
      const s = await getService();
      const picasa = await s.readPicasaEntry(entry);
      const faces: string[] = [];
      if(picasa.faces) {
        // Convert hashes to actual names
        for (const face of picasa.faces.split(";")) {
          const [rect, hash] = face.split(',');
          const faceAlbum = await s.getFaceAlbumFromHash(hash);
          if(faceAlbum) {
            faces.push(toBase64(JSON.stringify([faceAlbum.name, rect, "#FF0000"])));
          }
        }
        */
