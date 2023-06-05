const { Resizable } = require("../lib/resizable");
import { buildEmitter } from "../../shared/lib/event";
import { debounce, uuid, valuesOfEnum } from "../../shared/lib/utils";
import {
  AlbumEntryPicasa,
  AlbumEntryWithMetadata,
  AlbumEntry,
  Cell,
  Mosaic,
  MosaicProject,
  Format,
  Layout,
  Orientation,
  ProjectType,
  AlbumKind,
  JOBNAMES,
  MosaicSizes,
  GutterSizes,
} from "../../shared/types/types";
import { thumbnailUrl } from "../imageProcess/client";
import { $, _$, idFromAlbumEntry } from "../lib/dom";
import { getService } from "../rpc/connect";
import { SelectionManager } from "../selection/selection-manager";
import { AppEventSource } from "../uiTypes";
import { buildCells, leafs } from "./mosaic-tree-builder";
import {
  makeChoiceList,
  makeMultiselectImageList,
} from "./controls/multiselect";
import { TabEvent, makeGenericTab } from "./tabs";
import { t } from "./strings";

const editHTML = `
<div class="fill mosaic">
  <div class="mosaic-sidebar w3-theme">
    <div class="w3-bar-block mosaic-parameter-block mosaic-parameters">
      <div class="mosaic-parameters-title">${t("Mosaic Parameters")}</div>
    </div>
    <div class="w3-bar-block  mosaic-parameter-block mosaic-actions">
      <div class="w3-bar-block mosaic-parameters-title">Actions</div>
      <a class="mosaic-shuffle w3-bar-item w3-button">Shuffle</a>
      <a class="mosaic-make w3-bar-item w3-button">Make Image</a>
      <a class="mosaic-choose-folder w3-bar-item w3-button">Choose Folder</a>
      <a class="mosaic-add-selection w3-bar-item w3-button">Add from selection</a>
      <div class="mosaic-image-list w3-bar-item editor-image-block">Image List</div>
    </div>
    <div class="w3-bar-block mosaic-parameter-block mosaic-images">
      <div class="w3-bar-block mosaic-parameters-title">Images</div>
    </div>
  </div>
  <div class="mosaic-container centered">
    <div class="montage-container">
      <div class="montage"></div>
    </div>
  </div>
</div>`;

type MosaicImages = {
  image: string;
  key: any;
  selected: boolean;
  entry: AlbumEntryWithMetadata;
}[];

function rebuildMosaic(
  container: _$,
  projectData: Mosaic,
  rebuild: boolean,
  updated: Function
): { reflow: Function; erase: Function } {
  container.empty();

  const resolutions: { [key: string]: [width: number, height: number] } = {
    [Format.F10x8]: [1000, 800],
    [Format.F16x9]: [800, 450],
    [Format.F5x5]: [1000, 1000],
    [Format.F6x4]: [1200, 800],
  };
  const canvasSize = resolutions[projectData.format];

  if (projectData.orientation === Orientation.PORTRAIT) {
    canvasSize.reverse();
  }

  container.css({
    width: `${canvasSize[0]}px`,
    height: `${canvasSize[1]}px`,
  });
  const l =
    projectData.orientation === Orientation.PAYSAGE
      ? canvasSize[0]
      : canvasSize[1];
  const gutterInPx = (projectData.gutter / 100) * l;

  function buildHTMLForNode(node: Cell): string {
    let res = "";
    if (node.childs && node.childs.left) {
      let resizableStyle =
        node.split === "h" ? "resizable-top" : "resizable-left";
      res += `<div class="${resizableStyle} mosaic-element ${
        node.childs!.left.image ? "mosaic-image" : ""
      } " ${
        node.childs!.left.image
          ? `draggable style="background-image: url(${thumbnailUrl(
              node.childs!.left.image!,
              "th-large"
            )});"`
          : ""
      } id="${node.childs!.left.id}">${buildHTMLForNode(
        node.childs!.left
      )}</div>`;
    }
    if (node.childs && node.childs.right) {
      let resizableStyle =
        node.split === "h" ? "resizable-bottom" : "resizable-right";
      res += `<div class="${resizableStyle} mosaic-element ${
        node.childs!.right.image ? "mosaic-image" : ""
      }"  ${
        node.childs!.right.image
          ? `draggable style="background-image: url(${thumbnailUrl(
              node.childs!.right.image,
              "th-large"
            )});"`
          : ""
      } id="${node.childs!.right.id}">${buildHTMLForNode(
        node.childs!.right
      )}</div>`;
    }
    if (!node.childs) {
      res = `
      <button id="${node.id}~rotate-left" class="w3-button w3-theme mosaic-image-button mosaic-image-button-rotate-left"></button>
      <button id="${node.id}~rotate-right" class="w3-button w3-theme mosaic-image-button mosaic-image-button-rotate-right"></button>
      <button id="${node.id}~trash" class="w3-button w3-theme mosaic-image-button mosaic-image-button-trash"></button>
      `;
    }
    return res;
  }

  let root: Cell | undefined;
  if (rebuild || !projectData.root) {
    root = buildCells(projectData.images);
    projectData.root = root;
    updated(projectData);
  } else {
    root = projectData.root;
  }
  const html = buildHTMLForNode(root);
  container.innerHTML(html);
  let deleteResizable: (() => {}) | undefined;

  const nodes = [root];
  // Now create the div nodes
  var sizes: { [key: string]: number } = {};
  for (const node of nodes) {
    sizes[node.id] = node.weight!;
    if (node.childs) {
      nodes.push(node.childs.left);
      nodes.push(node.childs.right);
    }
  }

  return {
    reflow: () => {
      if (deleteResizable) {
        deleteResizable();
        deleteResizable = undefined;
      }

      const resizable = Resizable.initialise(
        container.get(),
        sizes,
        gutterInPx
      );
      const evt = () => {
        const sizes = Resizable.getSizes(resizable);
        for (const node of nodes) {
          if (sizes[node.id]) node.weight = sizes[node.id];
        }
        updated(projectData);
      };
      resizable.events.on("resized", (ev: any) => {
        debounce(evt, 200, "resize", false);
      });
      deleteResizable = resizable.delete;
      container.css({
        position: "relative",
      });
    },
    erase: () => {
      if (deleteResizable) {
        deleteResizable();
        deleteResizable = undefined;
      }
    },
  };
}

const OrientationLabels: { [key in Orientation]: string } = {
  [Orientation.PAYSAGE]: "Paysage",
  [Orientation.PORTRAIT]: "Portrait",
};
const FormatLabels: { [key in Format]: string } = {
  [Format.F10x8]: "10 / 8",
  [Format.F16x9]: "16 / 9",
  [Format.F5x5]: "5 / 5",
  [Format.F6x4]: "6 / 4",
};
const LayoutLabels: { [key in Layout]: string } = {
  [Layout.MOSAIC]: t("Mosaic"),
  [Layout.SQUARE]: t("Square"),
};

const GutterLabels: { [key in GutterSizes]: string } = {
  [GutterSizes.None]: t("None"),
  [GutterSizes.Small]: t("Small"),
  [GutterSizes.Medium]: t("Medium"),
  [GutterSizes.Large]: t("Large"),
};

async function installHandlers(container: _$, projectData: Mosaic) {
  function cellImageUpdated(cell: Cell) {
    container.all(`#${cell.id}`)[0]?.css({
      "background-image": `url(${thumbnailUrl(cell.image!, "th-large")})`,
    });
  }
  const s = await getService();
  const eventHandlers = [
    s.on("picasaFileMetaChanged", async (e: { payload: AlbumEntryPicasa }) => {
      const cell = leafs(projectData.root!).find(
        (c) =>
          c.image &&
          idFromAlbumEntry(c.image, "") === idFromAlbumEntry(e.payload, "")
      );
      if (cell) {
        cellImageUpdated(cell);
      }
    }),
  ];
  container.on("click", (ev: MouseEvent) => {
    console.info("click");
  });
  return eventHandlers;
}
export async function newMosaicProject(
  name: string,
  images: AlbumEntryWithMetadata[]
): Promise<AlbumEntry> {
  const s = await getService();
  const project = (await s.createProject(
    ProjectType.MOSAIC,
    name
  )) as MosaicProject;
  project.payload = {
    pool: images,
    images,
    gutter: GutterSizes.Small,
    layout: Layout.MOSAIC,
    orientation: Orientation.PAYSAGE,
    format: Format.F10x8,
    size: MosaicSizes.HD,
  };
  await s.writeProject(project, "new");
  return project;
}

export async function loadMosaicProject(
  entry: AlbumEntry
): Promise<MosaicProject> {
  const s = await getService();
  const project = (await s.getProject(entry)) as MosaicProject;
  if (project.album.name !== ProjectType.MOSAIC) {
    throw new Error("Invalid project type");
  }
  project.payload.images = project.payload.pool.filter((img) =>
    project.payload.images.find(
      (i) => idFromAlbumEntry(i, "") === idFromAlbumEntry(img, "")
    )
  );
  return project;
}

export async function savemosaicProject(
  project: MosaicProject,
  changeType: string
) {
  const s = await getService();
  await s.writeProject(project, changeType);
}

export async function makeMosaicPage(
  appEvents: AppEventSource,
  entry: AlbumEntry
) {
  const e = $(editHTML);
  const mosaic = $(".montage", e);
  let reflow: Function;
  let erase: Function;

  const project = await loadMosaicProject(entry);

  const s = await getService();
  s.on(
    "projectChanged",
    async (e: { payload: { project: Mosaic; changeType: string } }) => {}
  );

  const mosaicList: MosaicImages = project.payload.pool.map((img) => ({
    entry: img,
    key: idFromAlbumEntry(img, "select"),
    label: "",
    image: thumbnailUrl(img, "th-small"),
    selected: project.payload.images.includes(img),
  }));

  const selectionManager = new SelectionManager(project.payload.pool);
  const parameters = $(".mosaic-parameters", e);
  async function resized(sizes: any) {
    // Updated the weights
    /*const l = leafs(project.payload.root!);
    for (const node of l) {
      node.weight = sizes[node.id];
    }*/
    return savemosaicProject(project, "updateSize");
  }

  function redraw() {
    if (erase) {
      erase();
    }
    const r = rebuildMosaic(mosaic, project.payload, true, resized);
    reflow = r.reflow;
    erase = r.erase;
  }

  const orientationDropdown = makeChoiceList(
    "Orientation",
    valuesOfEnum(Orientation).map((k) => ({
      label: t(OrientationLabels[k as Orientation]),
      key: k,
    })),
    project.payload.orientation
  );
  orientationDropdown.emitter.on("select", ({ key }) => {
    project.payload.orientation = key;
    savemosaicProject(project, "updateOrientation");
    redraw();
    reflow();
  });
  parameters.append(orientationDropdown.element);

  const sizeDropdown = makeChoiceList(
    t("Target Size"),
    valuesOfEnum(MosaicSizes).map((k) => ({
      label: MosaicSizes[k],
      key: k,
    })),
    project.payload.size
  );
  sizeDropdown.emitter.on("select", ({ key }) => {
    project.payload.size = key;
    savemosaicProject(project, "updateSize");
  });
  parameters.append(sizeDropdown.element);

  const gutterDropdown = makeChoiceList(
    t("Gutter Size"),
    valuesOfEnum(GutterSizes).map((k) => ({
      label: t(GutterLabels[k as GutterSizes]),
      key: k,
    })),
    project.payload.gutter
  );
  gutterDropdown.emitter.on("select", ({ key }) => {
    project.payload.gutter = key;
    redraw();
    reflow();
    savemosaicProject(project, "updateGutter");
  });
  parameters.append(gutterDropdown.element);

  const layoutDropdown = makeChoiceList(
    "Layout",
    valuesOfEnum(Layout).map((k) => ({
      label: LayoutLabels[k as Layout],
      key: k,
    })),
    project.payload.layout
  );
  layoutDropdown.emitter.on("select", ({ key }) => {
    project.payload.layout = key;
    savemosaicProject(project, "updateLayout");
    redraw();
    reflow();
  });
  parameters.append(layoutDropdown.element);

  const formatDropdown = makeChoiceList(
    "Format",
    valuesOfEnum(Format).map((k) => ({
      label: FormatLabels[k as Format],
      key: k,
    })),
    project.payload.format
  );
  formatDropdown.emitter.on("select", ({ key }) => {
    project.payload.format = key;
    savemosaicProject(project, "updateFormat");
    redraw();
    reflow();
  });
  parameters.append(formatDropdown.element);

  const imageControl = makeMultiselectImageList<MosaicImages>(
    "Images",
    mosaicList
  );

  imageControl.emitter.on("multiselect", (e) => {
    project.payload.images = e.items.map((i) => i.entry);
    savemosaicProject(project, "updateImages");
    redraw();
    reflow();
  });

  $(".mosaic-images", e).empty().append(imageControl.element);
  $(".mosaic-make", e).on("click", async () => {
    const s = await getService();
    s.createJob(JOBNAMES.BUILD_PROJECT, {
      source: [project],
      argument: {
        width: 1000,
      },
    });
  });

  redraw();

  const off = [
    ...(await installHandlers(e, project.payload)),
    appEvents.on("tabDeleted", ({ win }) => {
      if (win.get() === e.get()) {
        off.forEach((o) => o());
        if (erase) {
          erase();
        }
      }
    }),
    appEvents.on("tabDisplayed", ({ win }) => {
      if (win.get() === e.get()) {
        if (reflow) {
          reflow();
        }
        //panner.moveTo(0,0);
        //panner.zoomAbs(0, 0, 1);
      }
    }),
  ];

  const tabEvent = buildEmitter<TabEvent>();
  const tab = makeGenericTab(tabEvent);
  tabEvent.emit("rename", { name: project.name });
  return { win: e, tab, selectionManager };
}
