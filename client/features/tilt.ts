import { ImageController } from "../components/image-controller";
import { ToolRegistrar } from "../components/tools";
import { toolHeader } from "../element-templates";
import { transform } from "../imageProcess/client";
import { $ } from "../lib/dom";
import { isPicture } from "../../shared/lib/utils";
import { ImagePanZoomController } from "../lib/panzoom";


export function setupTilt(
  container: HTMLElement,
  panZoomCtrl: ImagePanZoomController,
  imageCtrl: ImageController,
  toolRegistrar: ToolRegistrar
) {
  const name = "Tilt";
  const elem = $(`<div class="tilt fill" style="display: none">
  <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <pattern id="smallGrid" width="8" height="8" patternUnits="userSpaceOnUse">
      <path d="M 8 0 L 0 0 0 8" fill="none" stroke="gray" stroke-width="0.5"/>
    </pattern>
    <pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse">
      <rect width="80" height="80" fill="url(#smallGrid)"/>
      <path d="M 80 0 L 0 0 0 80" fill="none" stroke="gray" stroke-width="1"/>
    </pattern>
  </defs>
      
  <rect width="100%" height="100%" fill="url(#grid)" />
  <rect id="tiltArea" x="0" y="0" width="0" height="0" style="stroke:red;stroke-width:5" />
</svg>
  <div class="tool-control slidecontainer">
  <label>Rotation</label>
  <input type="range" min="-180" max="180" value="0" class="rotation slider">
  </div>
</div>`);

  $(container).append(elem);
  $(".rotation", container).on('change', ()=> {

  });

  function show() {
    panZoomCtrl.recenter();
    panZoomCtrl.enable(false);
    elem.css({ display: "block" });
  }

  toolRegistrar.registerTool(name, {
    filterName: "tilt",
    enable: (e) => isPicture(e),
    icon: async function (context) {
      // Tilt 45
      await transform(context, this.build(Math.PI/4, 0));
      return true;
    },
    activate: async function () {
      show();
      imageCtrl.addOperation(this.build(0, 0));
      return true;
    },
    build: function (angle: number, zoom: number) {
      return `${this.filterName}=1,${angle},${zoom})}`;
    },
    buildUI: function (index: number, args: string[]) {
      const e = toolHeader(name, index, imageCtrl);
      e.append(`<div>
        <div class="tool-control>
          <label>Show/Hide Grid</label>
          <input type="checkbox">
        </div>
        <div class="tool-control slidecontainer">
          <label>Rotation</label>
          <input type="range" min="-180" max="180" value="0" class="rotation slider">
        </div>
      </div>`);
      const update = () => {
        const rotation = Math.PI*parseFloat($(".rotation", e).val())/180;
        imageCtrl.updateOperation(index, this.build(rotation, 0));
      };
      $(".rotation", e).val(180*parseFloat(args[1] || "0")/Math.PI);
      $(".rotation", e).on("change", update);
      return e.get()!;
    },
  });
}
