const { Resizable } = require("../lib/resizable");
import { buildEmitter } from "../../shared/lib/event";
import { uuid } from "../../shared/lib/utils";
import { thumbnailUrl } from "../imageProcess/client";
import { $, _$ } from "../lib/dom";
import { getService } from "../rpc/connect";
import { AlbumEntry, AlbumEntryWithMetadata } from "../types/types";
import { AppEventSource } from "../uiTypes";
import { makeGenericTab, TabEvent } from "./tabs";


declare var panzoom: Function;

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

const editHTML = `<div class="fill">
<div class="fill w3-bar-block composition-parameters">
  <div class="w3-bar-item w3-white">Parameters</div>
    <div class="parameters">
    <div class="w3-dropdown-hover">
      <button class="w3-button">Layout</button>
      <div class="w3-dropdown-content w3-bar-block w3-card-4">
        <a href="#" class="w3-bar-item w3-button">6x4</a>
        <a href="#" class="w3-bar-item w3-button">5x5</a>
        <a href="#" class="w3-bar-item w3-button">4x6</a>
      </div>
    </div>
    <div class="w3-dropdown-hover">
      <button class="w3-button">Presentation</button>
      <div class="w3-dropdown-content w3-bar-block w3-card-4">
        <a href="#" class="w3-bar-item w3-button">Center Image</a>
        <a href="#" class="w3-bar-item w3-button">Spiral</a>
        <a href="#" class="w3-bar-item w3-button">Random</a>
        <a href="#" class="w3-bar-item w3-button">Pile</a>
      </div>
    </div>
  </div>
  <div class="w3-bar-item w3-white">Selection</div>
</div>

<div class="composition-container">
  <div class="montage"></div>

</div>
</div>`;



async function imageDimensions(a:AlbumEntry[]): Promise<AlbumEntryWithMetadata[]>
{
  const s = await getService();
  return Promise.all(a.map(entry => s.imageInfo(entry) as Promise<AlbumEntryWithMetadata>));  
}

export async function makeCompositorPage(
  appEvents: AppEventSource, selectedImages: AlbumEntry[]
): Promise<{ win: _$; tab: _$ }> {
  const imgs = await imageDimensions(selectedImages);

  // 1- sort images as portrait/paysage/square
  const portrait: AlbumEntryWithMetadata[] = [];
  const paysage: AlbumEntryWithMetadata[] = [];
  const square: AlbumEntryWithMetadata[] = [];
  for(const i of imgs) {
    if(Math.abs(1 - i.meta.width / i.meta.height) < 0.1) {
      square.push(i);
    } else if(i.meta.width > i.meta.height) {
      paysage.push(i);
    } else {
      portrait.push(i);
    }
  }
  const e = $(editHTML);

  // Add images
  // Create a binary tree with all the images
  const depth = Math.floor(Math.log(imgs.length)/Math.log(2));
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

  const randomized = [...allNodes].sort(()=> Math.random()-0.5);
  for(const img of imgs) {
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
        res += `<div class="resizable-top composited-element" ${node.childs!.left.image? ("style=\"background-image: url(" + thumbnailUrl(node.childs!.left.image!, "th-large") +");") : ""} id="${node.childs!.left.id}">${buildHTMLForNode(node.childs!.left)}</div>`;
      else
        res+= `<div class="resizable-left composited-element"  ${node.childs!.left.image? ("style=\"background-image: url(" + thumbnailUrl(node.childs!.left.image!, "th-large") +");") : ""} id="${node.childs!.left.id}">${buildHTMLForNode(node.childs!.left)}</div>`;
    }
    if(node.childs && node.childs.right) {
      if(node.split === "h")
        res+=`<div class="resizable-bottom composited-element"  ${node.childs!.right.image ? ("style=\"background-image: url(" + thumbnailUrl(node.childs!.right.image, "th-large") +");") : ""} id="${node.childs!.right.id}">${buildHTMLForNode(node.childs!.right)}</div>`;
     else  // "v"
     res+=`<div class="resizable-right composited-element"  ${node.childs!.right.image? ("style=\"background-image: url(" + thumbnailUrl(node.childs!.right.image, "th-large") +");") : ""} id="${node.childs!.right.id}">${buildHTMLForNode(node.childs!.right)}</div>`;
    }
    return res;
  }
  const html = buildHTMLForNode(root);
  // Now create the div nodes

  
  var sizes:{[key:string]: number} = {};
  for(const node of randomized) {
    sizes[node.id] = node.weight!;
  }

  $(".montage",e).innerHTML(html);
  let deleteResizable: () => {} | undefined;

  const panner = window["pz" as any] = panzoom(e.get(), {
    filterKey: function (/* e, dx, dy, dz */) {
      // don't let panzoom handle this event:
      return true;
    },
    maxZoom: 10,
    minZoom: 1,
    bounds: true,
    boundsPadding: 1,
    smoothScroll: true,
  });

  const off = [
    appEvents.on("tabDeleted", ({ win }) => {
      if (win.get() === e.get()) {
        off.forEach((o) => o());
        if(deleteResizable) {
          deleteResizable();
        }
      }
    }),
    appEvents.on("tabDisplayed", ({ win }) => {
      if (win.get() === e.get()) {
        deleteResizable = Resizable.initialise($(".montage",e).get(), sizes).delete;        
        panner.moveTo(0,0);
        panner.zoomAbs(0, 0, 1);
      }
    }),
  ];

  const tabEvent = buildEmitter<TabEvent>();
  const tab = makeGenericTab(tabEvent);
  tabEvent.emit("rename", { name: "Compositor" });  
  return { win: e, tab };
}
