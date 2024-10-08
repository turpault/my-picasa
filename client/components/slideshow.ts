import { buildEmitter } from "../../shared/lib/event";
import { idFromAlbumEntry, uuid } from "../../shared/lib/utils";
import {
  AlbumEntry,
  AlbumEntryWithMetadata,
  JOBNAMES,
  ProjectType,
  Slideshow,
  SlideShowDelays,
  SlideShowDelayValues,
  SlideshowProject,
  SlideShowTransitions,
  SlideShowTransitionsValues,
} from "../../shared/types/types";
import { thumbnailUrl } from "../imageProcess/client";
import { $, _$ } from "../lib/dom";
import { State } from "../lib/state";
import { getService } from "../rpc/connect";
import { SelectionManager } from "../selection/selection-manager";
import { AppEventSource } from "../uiTypes";
import { makeDraggableTable } from "./controls/draggable-table";
import { MakeForm } from "./controls/form";
import { PicasaMultiButton } from "./controls/multibutton";
import { message } from "./question";
import { t } from "./strings";
import { makeGenericTab, TabEvent } from "./tabs";

const videoResolutions = {
  "720p": { x: 1280, y: 720 },
  HD: { x: 1920, y: 1080 },
  "4k": { x: 3840, y: 2160 },
  "8k": { x: 7680, y: 4320 },
};

const editHTML = `
<div class="fill slideshow">
  <div class="slideshow-sidebar w3-theme">
    <div class="w3-bar-block slideshow-parameter-block slideshow-parameters">
      <div class="gradient-sidebar-title slideshow-parameters-title"></div>
    </div>
    <div class="w3-bar-block  slideshow-parameter-block slideshow-actions"></div>
  </div>
  <div class="slideshow-container">
    <div class="slideshow-container-child">
    </div>
  </div>
</div>`;

export async function newSlideshowProject(
  name: string,
  images: AlbumEntryWithMetadata[],
): Promise<AlbumEntry> {
  const s = await getService();
  const project = (await s.createProject(
    ProjectType.SLIDESHOW,
    name,
  )) as SlideshowProject;
  project.payload = {
    pages: [
      {
        id: uuid(),
        type: "text",
        text: name,
        delay: 5,
        transition: "fade",
      },
      ...images.map((img) => ({
        id: uuid(),
        type: "image" as const,
        entry: img,
        delay: 5 as SlideShowDelays,
        transition: "fade" as const,
      })),
    ],
  };

  await s.writeProject(project, name);
  return project;
}

function displayProject(project: SlideshowProject, parent: _$) {
  const container = $(".slideshow-container-child", parent);
  container.empty();
  const table = $("table").attr({ id: "table", class: "draggable-table" });
  table
    .appendAnd("thead")
    .append($("th").text(t("Thumbnail")))
    .append($("th").text(t("Text")))
    .append($("th").text(t("Text Color")))
    .append($("th").text(t("Background Color")))
    .append($("th").text(t("Duration")))
    .append($("th").text(t("Transition")))
    .append($("th").text(t("Remove")));

  const tableBody = $("tbody");
  project.payload.pages.forEach((entry) => {
    const row = $("tr");
    if (entry.type === "text") {
      row.appendAnd(`td`);
    } else if (entry.type === "image") {
      row
        .appendAnd("td")
        .appendAnd("img")
        .attr("src", thumbnailUrl(entry.entry!, "th-small"));
    }
    const input = $(`input`).attr({ type: "text", value: entry.text || "" });
    input.on("change", () => {
      entry.text = input.val() as string;
      saveSlideshowProject(project, "updateText");
    });
    row.appendAnd("td").appendAnd(input);
    // text color
    const textColor = $(`input`).attr({
      type: "color",
      value: entry.textColor || "#FFFFFF",
    });
    textColor.on("change", () => {
      entry.textColor = textColor.val() as string;
      saveSlideshowProject(project, "updateTextColor");
    });
    row.appendAnd("td").appendAnd(textColor);
    // background color
    const backgroundColor = $(`input`).attr({
      type: "color",
      value: entry.bgTextColor || "#000000",
    });
    backgroundColor.on("change", () => {
      entry.bgTextColor = backgroundColor.val() as string;
      saveSlideshowProject(project, "updateBackgroundColor");
    });
    row.appendAnd("td").appendAnd(backgroundColor);

    const duration = $<PicasaMultiButton>(`picasa-multi-button`).attr({
      items: SlideShowDelayValues.join("|"),
      selected: SlideShowDelayValues.indexOf(entry.delay),
    });
    duration.on("select", (evt: any) => {
      entry.delay = SlideShowDelayValues[evt.index];
      saveSlideshowProject(project, "updateDelay");
    });
    row.appendAnd("td").appendAnd(duration);

    const transition = $<PicasaMultiButton>("picasa-multi-button").attr({
      items: SlideShowTransitionsValues.join("|"),
      selected: SlideShowTransitionsValues.indexOf(entry.transition),
    });
    transition.on("select", (ev: any) => {
      entry.transition = SlideShowTransitionsValues[
        ev.index
      ] as SlideShowTransitions;
      saveSlideshowProject(project, "updateTransition");
    });
    row.appendAnd("td").appendAnd(transition);

    const remove = $("picasa-button")
      .attr({ icon: "resources/images/icons/actions/trash.svg" })
      .text(t("Remove"));
    remove.on("click", () => {
      project.payload.pages = project.payload.pages.filter(
        (e) => e.id !== entry.id,
      );
      saveSlideshowProject(project, "remove");
      displayProject(project, parent);
    });
    row.appendAnd("td").appendAnd(remove);

    row.id(entry.id);
    tableBody.append(row);
  });
  table.append(tableBody);
  container.append(table);
  makeDraggableTable(table.get()).on("reorder", (_e) => {
    const newEntries = tableBody.children().map((row) => {
      const id = row.id();
      return project.payload.pages.find((e) => e.id === id);
    });
    project.payload.pages = newEntries;
    saveSlideshowProject(project, "reorder");
  });
}
export async function loadSlideshowProject(
  entry: AlbumEntry,
): Promise<SlideshowProject> {
  const s = await getService();
  const project = (await s.getProject(entry)) as SlideshowProject;
  return project;
}

export async function saveSlideshowProject(
  project: SlideshowProject,
  changeType: string,
) {
  const s = await getService();
  await s.writeProject(project, changeType);
}

export async function makeSlideshowPage(
  appEvents: AppEventSource,
  entry: AlbumEntry,
) {
  const e = $(editHTML);

  const project = await loadSlideshowProject(entry);
  const selectionManager = new SelectionManager<AlbumEntry>(
    project.payload.pages.map((e) => e.entry).filter((e) => e),
    idFromAlbumEntry,
  );

  displayProject(project, e);
  const s = await getService();
  s.on(
    "projectChanged",
    async (e: { payload: { project: Slideshow; changeType: string } }) => {},
  );
  const parameters = $(".slideshow-parameters", e);
  type SlideshowStateDef = {
    transition: SlideShowTransitions;
    delay: SlideShowDelays;
    resolution: keyof typeof videoResolutions;
    generateSlideshow: boolean;
    addTitle: boolean;
    addSelection: boolean;
  };
  const formState = new State<SlideshowStateDef>({
    transition: "fade",
    delay: 5,
    resolution: "720p",
    generateSlideshow: false,
    addTitle: false,
    addSelection: false,
  });
  parameters.append(
    MakeForm(
      {
        entries: [
          {
            type: "choice",
            label: "Transition",
            values: [...SlideShowTransitionsValues],
            id: "transition",
          },
          {
            type: "choice",
            label: "Delay",
            id: "delay",
            values: [...SlideShowDelayValues].map((e) => e.toString()),
          },
          {
            type: "choice",
            label: "Output Resolution",
            id: "resolution",
            values: Object.keys(videoResolutions),
          },
          {
            type: "button",
            label: "Add Title",
            id: "addTitle",
            values: "addTitle",
            icon: "resources/images/add-text.svg",
          },
          {
            type: "button",
            label: "Add Selection",
            id: "addSelection",
            values: ["addSelection"],
            icon: "resources/images/add-selection.svg",
          },
          {
            type: "separator",
            label: "",
            values: "",
            id: "",
          },
          {
            type: "button",
            label: "Generate Slideshow",
            id: "generateSlideshow",
            values: ["generateSlideshow"],
            icon: "resources/images/generate-video.svg",
          },
        ],
      },
      formState,
    ),
  );

  const off = [
    formState.events.on("transition", (value) => {
      project.payload.pages.forEach((entry) => {
        entry.transition = value as SlideShowTransitions;
      });
      saveSlideshowProject(project, "updateTransition");
      displayProject(project, e);
    }),
    formState.events.on("delay", (value) => {
      project.payload.pages.forEach((entry) => {
        entry.delay = value;
      });
      displayProject(project, e);
      saveSlideshowProject(project, "updateDelay");
    }),
    formState.events.on("addTitle", (value) => {
      if (value) return; // only react on button up
      project.payload.pages.unshift({
        id: uuid(),
        type: "text",
        text: "",
        delay: 5,
        transition: "fade",
      });
      displayProject(project, e);
      saveSlideshowProject(project, "addTitle");
    }),
    formState.events.on("generateSlideshow", async (value) => {
      if (value) return; // only react on button up
      const resolution = formState.getValue("resolution") as string;

      let width =
        videoResolutions[resolution as keyof typeof videoResolutions].x;
      let height =
        videoResolutions[resolution as keyof typeof videoResolutions].y;
      const jobId = await s.createJob(JOBNAMES.BUILD_PROJECT, {
        source: [project],
        argument: { width, height },
      });
      const results = await s.waitJob(jobId);

      if (results.status === "finished") {
        const q = await message(t("Slideshow complete"), [
          t("Show"),
          t("Later"),
        ]);
        if (q === t("Show")) {
          appEvents.emit("edit", { active: true });
        }
      }
    }),
  ];

  const tabEvent = buildEmitter<TabEvent>();
  const tab = makeGenericTab(tabEvent);
  tabEvent.emit("rename", { name: project.name });
  return { win: e, tab, selectionManager };
}
