import { buildEmitter } from "../../shared/lib/event";
import {
  compareAlbumEntry,
  debounced,
  idFromAlbumEntry,
  valuesOfEnum,
} from "../../shared/lib/utils";
import {
  AlbumEntry,
  AlbumEntryPicasa,
  AlbumEntryWithMetadata,
  AlbumKind,
  Cell,
  Format,
  GutterSizes,
  Job,
  JOBNAMES,
  Layout,
  Mosaic,
  MosaicProject,
  MosaicSizes,
  Orientation,
  ProjectType,
} from "../../shared/types/types";
import { albumEntriesWithMetadata, thumbnailUrl } from "../imageProcess/client";
import { $, _$ } from "../lib/dom";
import { resizable } from "../lib/resizable";
import { getService } from "../rpc/connect";
import {
  AlbumEntrySelectionManager,
  SelectionManager,
} from "../selection/selection-manager";
import { AppEventSource, ApplicationState } from "../uiTypes";
import {
  makeChoiceList,
  makeMultiselectImageList,
} from "./controls/multiselect";
import {
  buildMosaicCells,
  buildSquareCells,
  leafs,
} from "./mosaic-tree-builder";
import { message } from "./question";
import { t } from "./strings";
import { makeGenericTab, TabEvent } from "./tabs";

const editHTML = `
<div class="fill mosaic">
  <div class="mosaic-sidebar w3-theme">
    <div class="w3-bar-block mosaic-parameter-block mosaic-parameters">
      <div class="gradient-sidebar-title mosaic-parameters-title">${t(
        "Mosaic Parameters",
      )}</div>
    </div>
    <div class="w3-bar-block  mosaic-parameter-block mosaic-actions">
      <div class="gradient-sidebar-title w3-bar-block mosaic-parameters-title">${t(
        "Actions",
      )}</div>
      <a class="mosaic-shuffle w3-bar-item w3-button">${t("Shuffle")}</a>
      <a class="mosaic-import-selection w3-bar-item w3-button">${t(
        "Import Selection",
      )}</a>
      <a class="mosaic-make w3-bar-item w3-button w3-green">${t(
        "Make Image",
      )}</a>
    </div>
    <div class="w3-bar-block mosaic-parameter-block mosaic-images">
      <div class="gradient-sidebar-title mosaic-image-list w3-bar-item">${t(
        "Image List",
      )}</div>
    </div>
  </div>
  <div class="mosaic-container centered">
    <div class="mosaic-container-child">
      <div class="mosaic-grid"></div>
    </div>
  </div>
</div>`;

const ProjectOutAlbumName = () => {
  const now = new Date();
  return `${now.getFullYear().toString()}-${(now.getMonth() + 1).toString().padStart(2, "0")}-${now.getDate().toString().padStart(2, "0")} ${t("Mosaics")}`;
};

function buildHTMLForNode(node: Cell): string {
  let res = "";
  if (node.childs && node.childs.left) {
    res += `<div class="mosaic-element ${
      node.childs!.left.image ? "mosaic-image" : ""
    } " ${
      node.childs!.left.image
        ? `draggable="true" style="background-image: url(${thumbnailUrl(
            node.childs!.left.image!,
            "th-large",
          )});"`
        : ""
    } id="${node.childs!.left.id}">${buildHTMLForNode(
      node.childs!.left,
    )}</div>`;
  }
  if (node.childs && node.childs.right) {
    res += `<div  class="mosaic-element ${
      node.childs!.right.image ? "mosaic-image" : ""
    }"  ${
      node.childs!.right.image
        ? `draggable="true" style="background-image: url(${thumbnailUrl(
            node.childs!.right.image,
            "th-large",
          )});"`
        : ""
    } id="${node.childs!.right.id}">${buildHTMLForNode(
      node.childs!.right,
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
function findCellById(root: Cell, id: string): Cell | undefined {
  if (root.id === id) {
    return root;
  }
  if (root.childs) {
    return (
      findCellById(root.childs.left, id) || findCellById(root.childs.right, id)
    );
  }
  return undefined;
}
function rebuildMosaic(
  container: _$,
  width: number,
  height: number,
  projectData: Mosaic,
  rebuild: boolean,
  pictures: AlbumEntryWithMetadata[],
  selectionManager: AlbumEntrySelectionManager,
  updated: (reason: string, redraw?: boolean, rebuild?: boolean) => void,
): { reflow: Function } {
  container.empty();

  container.css({
    width: `${width}px`,
    height: `${height}px`,
  });
  const l = projectData.orientation === Orientation.PAYSAGE ? width : height;
  const gutterInPx = (projectData.gutter / 100) * l;

  let root: Cell | undefined;
  if (rebuild || !projectData.root) {
    switch (projectData.layout) {
      case Layout.MOSAIC:
        root = buildMosaicCells(pictures, projectData.seed);
        break;
      case Layout.SQUARE:
        root = buildSquareCells(pictures, projectData.seed, width / height);
        break;
    }
    projectData.root = root;
    updated("reflown", false, false);
  } else {
    root = projectData.root;
  }
  const html = buildHTMLForNode(root);
  container.innerHTML(html);
  let deleteResizable: (() => {}) | undefined;

  container.get().removeEventListener;
  container.on("click", async (ev) => {
    const target = ev.target as HTMLElement;
    if (target.classList?.contains("mosaic-image-button-rotate-left")) {
      const nodeId = target.id.split("~")[0];
      const node = findCellById(root!, nodeId);
      if (node && node.image) {
        const s = await getService();
        s.rotate([node.image], "left");
      }
    } else if (target.classList.contains("mosaic-image-button-rotate-right")) {
      const nodeId = target.id.split("~")[0];
      const node = findCellById(root!, nodeId);
      if (node && node.image) {
        const s = await getService();
        s.rotate([node.image], "right");
      }
    } else if (target.classList.contains("mosaic-image-button-trash")) {
      const nodeId = target.id.split("~")[0];
      const node = findCellById(root!, nodeId);
      if (node && node.image) {
        selectionManager.deselect(node.image);
      }
    }
  });

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

      const debouncedUpdated = debounced(
        () => updated("resized"),
        200,
        false,
      ) as () => void;
      if (root)
        resizable(container, root, width, height, gutterInPx, debouncedUpdated);
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
  [Layout.MOSAIC]: "Mosaic",
  [Layout.SQUARE]: "Square",
};

const GutterLabels: { [key in GutterSizes]: string } = {
  [GutterSizes.None]: "None",
  [GutterSizes.Small]: "Small",
  [GutterSizes.Medium]: "Medium",
  [GutterSizes.Large]: "Large",
};

async function installHandlers(
  container: _$,
  projectData: Mosaic,
  projectUpdated: (
    reason: string,
    redraw: boolean,
    rebuildTree: boolean,
  ) => void,
) {
  function cellImageUpdated(cell: Cell) {
    container.all(`#${cell.id}`)[0]?.css({
      "background-image": `url(${thumbnailUrl(cell.image!, "th-large")})`,
    });
  }
  const s = await getService();
  const eventHandlers = [
    s.on(
      "albumEntryAspectChanged",
      async (e: { payload: AlbumEntryPicasa }) => {
        const cell = leafs(projectData.root!).find(
          (c) => c.image && compareAlbumEntry(c.image, e.payload) === 0,
        );
        if (cell) {
          cellImageUpdated(cell);
        }
      },
    ),
  ];
  container.on("click", (ev: MouseEvent) => {
    console.info("click");
  });
  container.on("dragstart", (ev) => {
    const dataTransfer = ev.dataTransfer;
    if (dataTransfer) {
      dataTransfer.setData("text/plain", (ev.target as any)?.id || "");
      dataTransfer.effectAllowed = "move";
    }
    ev.stopPropagation();
  });
  container.on("dragover", async (ev) => {
    ev.preventDefault();
  });
  container.on("drop", (ev) => {
    if (!projectData.root) return;
    const targetId = (ev.target as any)?.id;
    const sourceId = ev.dataTransfer?.getData("text/plain");
    const leaves = leafs(projectData.root!);
    const source = leaves.find((l) => l.id === sourceId);
    const target = leaves.find((l) => l.id === targetId);
    if (source?.image && target?.image) {
      console.info("swaping", source.image.name, target.image.name);
      const tmp = source.image;
      source.image = target.image;
      target.image = tmp;
      projectUpdated("dropped", true, false);
    }
    ev.stopPropagation();
  });
  return eventHandlers;
}

export async function newMosaicProject(
  name: string,
  images: AlbumEntry[],
): Promise<AlbumEntry> {
  const s = await getService();
  const project = (await s.createProject(
    ProjectType.MOSAIC,
    name,
  )) as MosaicProject;
  project.payload = {
    pool: images,
    images,
    gutter: GutterSizes.Small,
    layout: Layout.MOSAIC,
    orientation: Orientation.PAYSAGE,
    format: Format.F10x8,
    size: MosaicSizes.HD,
    seed: Math.random(),
  };
  await s.writeProject(project, "new");
  return project;
}

async function loadMosaicProject(entry: AlbumEntry): Promise<MosaicProject> {
  const s = await getService();
  const project = (await s.getProject(entry)) as MosaicProject;
  if (project.album.name !== ProjectType.MOSAIC) {
    throw new Error("Invalid project type");
  }
  const m = new Map<string, AlbumEntry>();
  project.payload.pool.forEach((img) => m.set(idFromAlbumEntry(img), img));
  project.payload.images = project.payload.images.map(
    (img) => m.get(idFromAlbumEntry(img))!,
  );
  return project;
}

function sanitizeTree(root: Cell) {
  if (root.childs) {
    if (!root.childs.left || !root.childs.right) {
      root.childs = undefined;
    } else {
      sanitizeTree(root.childs.left);
      sanitizeTree(root.childs.right);
    }
  }
  if (
    Number.isNaN(root.weight) ||
    root.weight < 0 ||
    root.weight > 1 ||
    root.weight === undefined
  ) {
    root.weight = 1;
  }
}

export async function makeMosaicPage(
  appEvents: AppEventSource,
  entry: AlbumEntry,
  state: ApplicationState,
) {
  const e = $(editHTML);
  const mosaic = $(".mosaic-grid", e);
  const mosaicContainer = $(".mosaic-container", e);
  let reflow: Function;

  const project = await loadMosaicProject(entry);

  const selectionManager = new SelectionManager<AlbumEntry>(
    project.payload.images,
    idFromAlbumEntry,
  );
  const parameters = $(".mosaic-parameters", e);

  async function projectUpdated(
    reason: string,
    redrawNow: boolean = false,
    rebuildTree: boolean = false,
  ) {
    const s = await getService();
    await s.writeProject(
      { ...project, images: selectionManager.selected() },
      reason,
    );

    if (redrawNow) {
      redraw(rebuildTree);
    }
  }

  async function redraw(rebuildTree = true) {
    const width = mosaicContainer.width;
    const height = mosaicContainer.height;
    let ratio = project.payload.format;

    if (project.payload.orientation === Orientation.PORTRAIT) {
      ratio = 1 / ratio;
    }

    let updatedW = height * ratio;
    let updatedH = height;
    if (updatedW > width) {
      updatedW = width;
      updatedH = width / ratio;
    }

    const pictures = await albumEntriesWithMetadata(
      selectionManager.selected(),
    );
    const r = rebuildMosaic(
      mosaic,
      updatedW,
      updatedH,
      project.payload,
      rebuildTree,
      pictures,
      selectionManager,
      projectUpdated,
    );
    requestAnimationFrame(() => r.reflow());
    reflow = r.reflow();
  }

  const orientationDropdown = makeChoiceList(
    "Orientation",
    valuesOfEnum(Orientation).map((k) => ({
      label: t(OrientationLabels[k as Orientation]),
      key: k,
    })),
    project.payload.orientation,
    "dropdown",
  );
  parameters.append(orientationDropdown.element);

  const sizeDropdown = makeChoiceList(
    t("Target Size"),
    valuesOfEnum(MosaicSizes).map((k) => ({
      label: MosaicSizes[k],
      key: k,
    })),
    project.payload.size,
    "dropdown",
  );
  sizeDropdown.emitter.on("select", ({ key }) => {
    project.payload.size = key;
    projectUpdated("updateSize");
  });
  parameters.append(sizeDropdown.element);

  const gutterDropdown = makeChoiceList(
    t("Gutter Size"),
    valuesOfEnum(GutterSizes).map((k) => ({
      label: t(GutterLabels[k as GutterSizes]),
      key: k,
    })),
    project.payload.gutter,
    "dropdown",
  );
  parameters.append(gutterDropdown.element);

  const layoutDropdown = makeChoiceList(
    "Layout",
    valuesOfEnum(Layout).map((k) => ({
      label: LayoutLabels[k as Layout],
      key: k,
    })),
    project.payload.layout,
    "dropdown",
  );
  parameters.append(layoutDropdown.element);

  const formatDropdown = makeChoiceList(
    "Format",
    valuesOfEnum(Format).map((k) => ({
      label: FormatLabels[k as Format],
      key: k,
    })),
    project.payload.format,
    "dropdown",
  );
  parameters.append(formatDropdown.element);

  const imageControl = makeMultiselectImageList(
    t("Pictures"),
    project.payload.pool,
    selectionManager,
    "th-small",
    "mosaic-image-control",
  );

  $(".mosaic-images", e).empty().append(imageControl);

  const off = [
    orientationDropdown.emitter.on("select", ({ key }) => {
      project.payload.orientation = key;
      projectUpdated("updateOrientation", true);
    }),
    gutterDropdown.emitter.on("select", ({ key }) => {
      project.payload.gutter = key;
      projectUpdated("updateGutter", true, false);
    }),
    formatDropdown.emitter.on("select", ({ key }) => {
      project.payload.format = key;
      projectUpdated("updateFormat", true, true);
    }),
    layoutDropdown.emitter.on("select", ({ key }) => {
      project.payload.layout = key;
      projectUpdated("updateLayout", true, true);
    }),

    $(".mosaic-make", e).onWithOff("click", async () => {
      const s = await getService();
      const jobId = await s.createJob(JOBNAMES.BUILD_PROJECT, {
        source: [project],
        destination: ProjectOutAlbumName(),
        argument: {},
      });
      const results = (await s.waitJob(jobId)) as Job;

      if (results.status === "finished") {
        if (results?.errors.length > 0) {
          console.error("Error building mosaic", results.errors);
          await message(
            t("Error building mosaic") + ":<br>" + results.errors.join("<br>"),
            ["Ok"],
          );
          return;
        }
        const q = await message(t("Mosaic complete"), ["Show", "Later"]);
        if (q === "Show") {
          appEvents.emit("edit", { entry: results.out[0] });
        }
      }
    }),
    $(".mosaic-shuffle", e).onWithOff("click", async () => {
      project.payload.seed = Math.random();
      projectUpdated("updateSeed", true, true);
    }),
    $(".mosaic-import-selection", e).onWithOff("click", async () => {
      const browserSelection = state
        .getValue("browserSelectionManager")!
        .selected();
      const newPics = browserSelection.filter(
        (img) =>
          !project.payload.pool
            .map((i) => idFromAlbumEntry(i))
            .includes(idFromAlbumEntry(img)) &&
          img.album.kind === AlbumKind.FOLDER,
      );
      if (newPics.length === 0) return;

      const newImages = await albumEntriesWithMetadata(newPics);
      project.payload.pool.push(...newImages);

      const imageControl = makeMultiselectImageList(
        t("Images"),
        project.payload.pool,
        selectionManager,
        "th-small",
        "mosaic-image-control",
      );

      $(".mosaic-images", e).empty().append(imageControl);
      projectUpdated("updatePool");
    }),
    ...(await installHandlers(e, project.payload, projectUpdated)),
    appEvents.on("tabDeleted", ({ win }) => {
      if (win.get() === e.get()) {
        off.forEach((o) => o());
      }
    }),
    appEvents.on("tabDisplayed", ({ win }) => {
      if (win.get() === e.get()) {
        if (reflow) {
          reflow();
        }
      }
    }),
    appEvents.on("keyDown", ({ code, preventDefault }) => {
      if (!state.getValue("activeTab").win.is(e)) return;
      switch (code) {
        case "Escape":
          preventDefault();
          appEvents.emit("returnToBrowser");
      }
    }),
    selectionManager.events.on("changed", () => {
      projectUpdated("updateSelection", true, true);
    }),
    state.getValue("browserSelectionManager").events.on("changed", async () => {
      const selection = state.getValue("browserSelectionManager")!.selected();

      const newPics = selection.filter(
        (img) =>
          !project.payload.pool
            .map((i) => idFromAlbumEntry(i))
            .includes(idFromAlbumEntry(img)) &&
          img.album.kind === AlbumKind.FOLDER,
      );

      const ctrl = $(".mosaic-import-selection", e);
      ctrl.addRemoveClass("disabled", newPics.length === 0);
      ctrl.text(
        `${t("Import Selection")} (${newPics.length ? newPics.length.toString() + " " + t("pictures") : t("None")})`,
      );
    }),
    (() => {
      const observer = new ResizeObserver(() => {
        redraw(false);
      });
      observer.observe(e.get());
      return () => observer.disconnect();
    })(),
  ];

  const tabEvent = buildEmitter<TabEvent>();
  const tab = makeGenericTab(tabEvent);
  tabEvent.emit("rename", { name: project.name });
  return { win: e, tab, selectionManager };
}
