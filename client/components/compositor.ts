const { Resizable } = require("../lib/resizable");
import { buildEmitter } from "../../shared/lib/event";
import { uuid, valuesOfEnum } from "../../shared/lib/utils";
import { AlbumEntry, AlbumEntryWithMetadata, Format, Orientation } from "../../shared/types/types";
import { thumbnailUrl } from "../imageProcess/client";
import { $, idFromAlbumEntry, _$ } from "../lib/dom";
import { getService } from "../rpc/connect";
import { AppEventSource } from "../uiTypes";
import { makeChoiceList, makeMultiselectImageList } from "./controls/multiselect";
import { makeGenericTab, TabEvent } from "./tabs";


type Cell = {
  id: string;
  split: "v"|"h",
  image?:AlbumEntryWithMetadata,
  weight?:number;
  childs?: {
    left: Cell;
    right: Cell;
  }
};
enum Layout  {
  MOSAIC,
  SQUARE,
}


const editHTML = `
<div class="fill">
  <div class="composition-sidebar w3-theme w3-sidebar">
    <div class="w3-bar-block composition-parameter-block composition-parameters">
      <div class="composition-parameters-title">Composition Parameters</div>
    </div>
    <div class="w3-bar-block  composition-parameter-block composition-actions">
      <div class="w3-bar-block composition-parameters-title">Actions</div>
      <a class="compose-shuffle w3-bar-item w3-button">Shuffle</a>
      <a class="compose-make w3-bar-item w3-button">Make Image</a>
      <a class="compose-choose-folder w3-bar-item w3-button">Choose Folder</a>
      <a class="compose-add-selection w3-bar-item w3-button">Add from selection</a>
      <div class="compose-image-list w3-bar-item editor-image-block">Image List</div>
    </div>
    <div class="w3-bar-block composition-parameter-block composition-images">
      <div class="w3-bar-block composition-parameters-title">Images</div>
    </div>
  </div>
  <div class="composition-container">
    <div class="montage"></div>
  </div>
</div>`;


type CompositedImages =  ({ image: string, key: any, selected: boolean } & AlbumEntryWithMetadata)[] ;

async function imageDimensions(a:AlbumEntry[]): Promise<AlbumEntryWithMetadata[]>
{
  const s = await getService();
  return Promise.all(a.map(entry => s.imageInfo(entry) as Promise<AlbumEntryWithMetadata>));
}

function rebuildMosaic(container: _$, list:AlbumEntryWithMetadata[], method: Layout, orientation:Orientation, format: Format): {reflow: Function, erase: Function} {

  container.empty();
  // 1- sort images as portrait/paysage/square
  const portrait: AlbumEntryWithMetadata[] = [];
  const paysage: AlbumEntryWithMetadata[] = [];
  const square: AlbumEntryWithMetadata[] = [];
  for(const i of list) {
    if(Math.abs(1 - i.meta.width / i.meta.height) < 0.1) {
      square.push(i);
    } else if(i.meta.width > i.meta.height) {
      paysage.push(i);
    } else {
      portrait.push(i);
    }
  }
  const resolutions:{[key: string]: [width: Number, height: Number]} = {
    [Format.F10x8]: [ 1000,  800],
    [Format.F16x9]: [ 800, 450],
    [Format.F5x5]: [1000,  1000],
    [Format.F6x4]: [ 1200,  800],
  };
  const canvasSize = resolutions[format];
  if(orientation === Orientation.PORTRAIT) {
    canvasSize.reverse();
  }
  container.css({
    width: `${canvasSize[0]}px`,
    height: `${canvasSize[1]}px`,
  });

  // Add images
  // Create a binary tree with all the images
  const depth = Math.ceil(Math.log(list.length)/Math.log(2));
  function leaves(nodes:Cell[]) {
    let cnt = 0;
    for(const node of nodes) {
      if(!node.childs) {
        cnt++;
      }
    }
    return cnt;
  }
  function split(node: Cell, remainingDepth: number): {node: Cell, allNodes: Cell[]} {
    if(remainingDepth === 0) {
      return {node, allNodes:[node]};
    }
    const {node: leftNode, allNodes: allLeftNodes} = split({ id: uuid(), split: node.split === "v" ? "h" : "v"}, remainingDepth-1);
    const {node: rightNode, allNodes: allRightNodes} = split({ id: uuid(), split: node.split === "v" ? "h" : "v"}, remainingDepth-1);
    node.childs = {
      left: leftNode,
      right: rightNode
    }
    return {node, allNodes: [node, ...allLeftNodes, ...allRightNodes]};
  }
  const {node: root, allNodes } = split({
    id: uuid(),
    split: "v"
  }, depth);

  if(leaves(allNodes)!== Math.pow(2, depth)) {
    throw new Error("Wrong number of leaves");
  }

  const randomized1 = [...allNodes].sort(()=> Math.random()-0.5);
  // Remove extra nodes
  let extraNodeCount = Math.pow(2, depth) - list.length;
  for(const node of randomized1) {
    if(extraNodeCount >0 && node.childs && !node.childs.left.childs && !node.childs.right.childs) {
      //console.info('Removing nodes', node.childs.left.id, node.childs.right.id);
      extraNodeCount--;
      allNodes.splice(allNodes.indexOf(node.childs.left),1);
      allNodes.splice(allNodes.indexOf(node.childs.right),1);
      delete node.childs;
    }
  }
  if(leaves(allNodes)!== list.length) {
    throw new Error("Wrong number of leaves");
  }
  const randomized = [...allNodes].sort(()=> Math.random()-0.5);
  if(leaves(randomized)!== list.length) {
    throw new Error("Wrong number of leaves");
  }


  for(const img of list) {
    let found = false;
    for(const node of randomized) {
      if(!node.childs && !node.image) {
        // There's still room left
        found = true;
        break;
      }
    }
    if(!found) {
      // no available slot, pick a random one and split
      for(const node of randomized) {
        if(!node.childs) {
          const copy = {...node};
          node.image = undefined;
          const { allNodes: newNodes } = split(node, 1);
          node.childs!.left = {...copy, split: copy.split === "v" ? "h" : "v"};
          randomized.push(node.childs!.right);
          randomized.push(node);
          randomized.splice(randomized.indexOf(node),1);
          break;
        }
      }
    }

    found = false;
    // Find a node with no childs
    for(const node of randomized) {
      if(!found && !node.childs && node.split === "v" && paysage.includes(img) && !node.image) {
        found = true;
        node.image = img;
        break;
      }
      if(!found && !node.childs && node.split === "h" && portrait.includes(img) && !node.image) {
        found = true;
        node.image = img;
        break;
      }
      if(!found && !node.childs && square.includes(img) && !node.image) {
        found = true;
        node.image = img;
        break;
      }
    }
    if(!found) {
      for(const node of randomized) {
        if(!node.image && !node.childs) {
          node.image = img;
          found = true;
          break;
        }
      }
    }
    if(!found) {
      throw new Error("Should have found");
    }
  }

  // Balance weights
  function weightOf(node: Cell): {w: number, h: number} {
    if(node.childs) {
      const { w: wLeft, h: hLeft} = weightOf(node.childs.left);
      const { w: wRight, h: hRight} = weightOf(node.childs.right);
      if(node.split === "h") {
        node.childs.left.weight = hLeft / (hLeft + hRight);
        node.childs.right.weight = hRight / (hLeft + hRight);
        return { w: Math.max(wLeft + wRight), h: hLeft + hRight};
      } else { // split === "v"
        node.childs.left.weight = wLeft / (wLeft + wRight);
        node.childs.right.weight = wRight / (wLeft + wRight);
        return { w: wLeft + wRight, h: Math.max(hLeft + hRight)};
      }
    }
    if(portrait.includes(node.image!)) {
      return {w:4, h:6};
    }
    if(paysage.includes(node.image!)) {
      return {w:6, h:4};
    }
    if(square.includes(node.image!)) {
      return {w:5, h:5};
    }
    throw new Error("Should not get here");
  }

  weightOf(root);
  function buildHTMLForNode(node: Cell) : string {
    let res = "";
    if(node.childs && node.childs.left) {
      if(node.split === "h")
        res += `<div class="resizable-top composited-element ${node.childs!.left.image?"composited-image":""} " ${node.childs!.left.image? ("draggable style=\"background-image: url(" + thumbnailUrl(node.childs!.left.image!, "th-large") +");") : ""} id="${node.childs!.left.id}">${buildHTMLForNode(node.childs!.left)}</div>`;
      else
        res+= `<div class="resizable-left composited-element ${node.childs!.left.image?"composited-image":""}"  ${node.childs!.left.image? ("draggable style=\"background-image: url(" + thumbnailUrl(node.childs!.left.image!, "th-large") +");") : ""} id="${node.childs!.left.id}">${buildHTMLForNode(node.childs!.left)}</div>`;
    }
    if(node.childs && node.childs.right) {
      if(node.split === "h")
        res+=`<div class="resizable-bottom composited-element ${node.childs!.right.image?"composited-image":""}"  ${node.childs!.right.image ? ("draggable style=\"background-image: url(" + thumbnailUrl(node.childs!.right.image, "th-large") +");") : ""} id="${node.childs!.right.id}">${buildHTMLForNode(node.childs!.right)}</div>`;
     else  // "v"
     res+=`<div class="resizable-right composited-element ${node.childs!.right.image?"composited-image":""}"  ${node.childs!.right.image? ("draggable style=\"background-image: url(" + thumbnailUrl(node.childs!.right.image, "th-large") +");") : ""} id="${node.childs!.right.id}">${buildHTMLForNode(node.childs!.right)}</div>`;
    }
    return res;
  }
  const html = buildHTMLForNode(root);
  // Now create the div nodes


  var sizes:{[key:string]: number} = {};
  for(const node of randomized) {
    sizes[node.id] = node.weight!;
  }

  container.innerHTML(html);
  let deleteResizable: (() => {}) | undefined;

  let draggedImageElement: _$;
  for(const elem of container.all('.composited-image')) {

  elem.on(
    "dragstart",
    (ev: DragEvent) => {
        ev.dataTransfer!.effectAllowed = "move";
        ev.dataTransfer!.setDragImage(elem.get(), 0, 0);
        draggedImageElement = elem;
      //ev.preventDefault();
    }
    ,
    false
  ).on(
    "dragenter",
    (ev: any) => {
        elem.css("opacity", "0.5");

      //ev.preventDefault();
    },
    false
  ).on(
    "dragleave",
    (ev: any) => {
      elem.css("opacity", "1");
      //ev.preventDefault();
    },
    false
  ).on(
    "drop",
    (ev: any) => {
      elem.css("opacity", "1");
      const swapCSS = "background-image";
      const cp = elem.css(swapCSS);
      elem.css(swapCSS, draggedImageElement.css(swapCSS));
      draggedImageElement.css(swapCSS, cp);
      //ev.preventDefault();
    },
    false
  );
  }

  return {
    reflow: () => {
      if(deleteResizable) {
        deleteResizable();
        deleteResizable = undefined;
      }
      deleteResizable = Resizable.initialise(container.get(), sizes).delete;
    },
    erase: () => {
      if(deleteResizable) {
        deleteResizable();
        deleteResizable = undefined;
      }
    }
  }

}

const OrientationLabels:{[key in Orientation]: string } = {
  [Orientation.PAYSAGE]: "Paysage",
  [Orientation.PORTRAIT]: "Portrait",
}
const FormatLabels:{[key in Format]: string } = {
  [Format.F10x8]: "10 / 8",
  [Format.F16x9]: "16 / 9",
  [Format.F5x5]: "5 / 5",
  [Format.F6x4]: "6 / 4"
}
const LayoutLabels:{[key in Layout]: string } = {
  [Layout.MOSAIC]: "Mosaic",
  [Layout.SQUARE]: "Square",
}


export async function makeCompositorPage(
  appEvents: AppEventSource, selectedImages: AlbumEntry[]
): Promise<{ win: _$; tab: _$ }> {
  const e = $(editHTML);
  const montageImages = selectedImages;
  const mosaic = $(".montage",e);
  let imgs = await imageDimensions(montageImages);
  let reflow: Function;
  let erase: Function;
  let format:Format = Format.F10x8;
  let layout:Layout = Layout.MOSAIC;
  let orientation:Orientation = Orientation.PAYSAGE;
  const compositionList: CompositedImages = imgs.map(img=> ({...img, key: idFromAlbumEntry(img, "select"), label:"", image:thumbnailUrl(img, "th-small"), selected: true}));

  const parameters = $(".composition-parameters", e);
  function redraw() {
    if(erase) {
      erase();
    }
    const r = rebuildMosaic(mosaic, compositionList, layout, orientation, format);
    reflow = r.reflow;
    erase = r.erase;
  }

  const orientationDropdown = makeChoiceList("Orientation", valuesOfEnum(Orientation).map(k => ({
    label: OrientationLabels[k as Orientation],
    key: k
  })), orientation);
  orientationDropdown.emitter.on("select", ({key}) => {
    orientation = key;
    redraw();
    reflow();
  });
  parameters.append(orientationDropdown.element);


  const layoutDropdown = makeChoiceList("Layout", valuesOfEnum(Layout).map(k => ({
    label: LayoutLabels[k as Layout],
    key: k
  })), layout);
  layoutDropdown.emitter.on("select", ({key}) => {
    layout = key;
    redraw();
    reflow();
  });
  parameters.append(layoutDropdown.element);


  const formatDropdown = makeChoiceList("Format", valuesOfEnum(Format).map(k => ({
    label: FormatLabels[k as Format],
    key: k
  })), format);
  formatDropdown.emitter.on("select", ({key}) => {
    format = key;
    redraw();
    reflow();
  });
  parameters.append(formatDropdown.element);


  const imageControl = makeMultiselectImageList("Images", compositionList);

  imageControl.emitter.on('multiselect', (e) => {
    redraw();
    reflow();
  });

  $(".composition-images", e).empty().append(imageControl.element);

  redraw();

  /*const panner = window["pz" as any] = panzoom(e.get(), {
    filterKey: function () {
      // don't let panzoom handle this event:
      return true;
    },
    maxZoom: 10,
    minZoom: 1,
    bounds: true,
    boundsPadding: 1,
    smoothScroll: true,
  });*/

  const off = [
    appEvents.on("tabDeleted", ({ win }) => {
      if (win.get() === e.get()) {
        off.forEach((o) => o());
        if(erase) {
          erase();
        }
          }
    }),
    appEvents.on("tabDisplayed", ({ win }) => {
      if (win.get() === e.get()) {
        if(reflow) {
          reflow();
        }
        //panner.moveTo(0,0);
        //panner.zoomAbs(0, 0, 1);
      }
    }),
  ];

  const tabEvent = buildEmitter<TabEvent>();
  const tab = makeGenericTab(tabEvent);
  tabEvent.emit("rename", { name: "Compositor" });
  return { win: e, tab };
}
