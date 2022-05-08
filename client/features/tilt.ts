import { ImageController } from "../components/image-controller";
import { ToolRegistrar } from "../components/tools";
import { toolHeader } from "../element-templates";
import { transform } from "../imageProcess/client";
import { $ } from "../lib/dom";
import { isPicture } from "../../shared/lib/utils";


export function setupTilt(
  container: HTMLElement,
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
</svg>
</div>`);

  $(container).append(elem);

  toolRegistrar.registerTool(name, {
    filterName: "tilt",
    enable: (e) => isPicture(e),
    icon: async function (context) {
      // Tilt 45
      await transform(context, this.build(Math.PI/4, 0));
      return true;
    },
    activate: async function () {
      imageCtrl.addOperation(this.build(0, 0));
      elem.css({ display: "block" });
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
          <input type="checkbox" class
        </div>
        <div class="tool-control slidecontainer">
          <label>Rotation</label>
          <input type="range" min="-180" max="180" value="0" class="rotation slider">
        </div>
        <div class="tool-control slidecontainer">
          <label>Zoom</label>
          <input type="range" min="0" max="10" value="0" class="zoom slider">
        </div>
      </div>`);
      const update = () => {
        const rotation = Math.PI*parseInt($(".rotation", e).val())/180;
        const zoom = 10*parseInt($(".zoom", e).val());
        imageCtrl.updateOperation(index, this.build(rotation, zoom));
      };
      $(".rotation", e).val(180*parseInt(args[1] || "0")/Math.PI);
      $(".zoom", e).val(parseInt(args[2] || "0")/10);
      $(".rotation", e).on("change", update);
      $(".zoom", e).on("change", update);
      return e.get()!;
    },
  });
}
