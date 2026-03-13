import { uuid } from "../../shared/lib/utils";
import { Album, AlbumWithData, Contact, JOBNAMES, Project, Shortcut } from "../../shared/types/types";
import { getAlbumContents } from "../folder-utils";
import {
  $,
  _$,
  albumFromElement,
  elementFromAlbum,
  setIdForAlbum,
} from "../lib/dom";
import { getService } from "../rpc/connect";
import { AlbumEntrySelectionManager } from "../selection/selection-manager";
import { AppEventSource } from "../uiTypes";
import { getAlbumCache } from "../lib/caches/album-cache";
import { getShortcutCache } from "../lib/caches/shortcut-cache";
import { getContactCache } from "../lib/caches/contact-cache";
import { getProjectCache } from "../lib/caches/project-cache";
import { ProjectType, projectKeyFromType, personKeyFromName } from "../../shared/types/types";
import { t } from "./strings";
import { AlbumListEventSource } from "../uiTypes";

const elementPrefix = "albumlist:";
const html = `<div class="w3-theme fill folder-pane">
<div class="folders"></div>
</div>
`;

type ListItem = {
  album?: Album;
  project?: Project;
  contact?: Contact;
  shortcut?: Shortcut;
  name: string;
  count?: number;
};

export async function makeAlbumList(
  appEvents: AppEventSource,
  selectionManager: AlbumEntrySelectionManager,
  albumListEvents: AlbumListEventSource,
) {
  const container = $(html);
  const folders = $(".folders", container);
  const id = uuid();
  let shortcutItems: ListItem[] = [];
  let folderItems: ListItem[] = [];
  let projectItems: ListItem[] = [];
  let personItems: ListItem[] = [];
  let foldersByYear: Map<string, ListItem[]> = new Map();
  let collapsed: { [key: string]: boolean } = {};

  const albumCache = getAlbumCache();
  const shortcutCache = getShortcutCache();
  const contactCache = getContactCache();
  const projectCache = getProjectCache();

  // Caches should already be initialized by app.ts, but ensure they're ready
  if (!albumCache.getAlbums().length) {
    await Promise.all([
      albumCache.init(),
      shortcutCache.init(),
      contactCache.init(),
      projectCache.init(),
    ]);
  }

  function buildItemsFromCache() {
    const albums = albumCache.getAlbums();
    const shortcuts = shortcutCache.getShortcuts();
    const contacts = contactCache.getContacts();

    // Build shortcut items
    shortcutItems = shortcuts.map((shortcut) => ({
      album: shortcut.album,
      shortcut: shortcut,
      name: shortcut.album.name,
      count: 0, // FIXME - get count from album
    }));

    // Separate albums into folders only (projects and persons come from their respective caches)
    folderItems = [];

    for (const album of albums) {
      if (album.shortcut) {
        // This is a shortcut album (already in shortcutItems)
        continue;
      }
      folderItems.push({
        album,
        name: album.name,
        count: album.count,
      });
    }

    // Build project items from ProjectCache
    projectItems = [
      {
        project: { name: ProjectType.MOSAIC, type: ProjectType.MOSAIC },
        name: ProjectType.MOSAIC,
        count: projectCache.getProjectsCount(ProjectType.MOSAIC),
      },
      {
        project: { name: ProjectType.SLIDESHOW, type: ProjectType.SLIDESHOW },
        name: ProjectType.SLIDESHOW,
        count: projectCache.getProjectsCount(ProjectType.SLIDESHOW),
      },
    ];

    // Build person items from ContactCache
    personItems = contacts.map((contact) => ({
      contact,
      name: contact.name,
      count: 0, // FIXME - get count
    }));

    // Organize folders by year
    foldersByYear = new Map<string, ListItem[]>();
    for (const folder of folderItems) {
      const year = folder.name.slice(0, 4);
      if (!foldersByYear.has(year)) {
        foldersByYear.set(year, []);
      }
      foldersByYear.get(year)!.push(folder);
    }
  }

  function renderItem(item: ListItem): _$ {
    const label = item.shortcut
      ? String.fromCharCode(0x245f + parseInt(item.shortcut.shortcut)) + " " + item.name
      : item.name;
    const r = $(
      `
      <div class="browser-list-text">
      <span class="browser-list-count"/>${item.count ?? ""}</span>
      <div class="browser-list-label">${label}</div>
      </div>`,
    );
    if (item.album) {
      setIdForAlbum(r, item.album, elementPrefix);
    } else if (item.project) {
      r.id(`${elementPrefix}project|${item.project.type}`);
    } else if (item.contact) {
      r.id(`${elementPrefix}person|${item.contact.id}`);
    }
    r.attachData({ item });
    return r;
  }

  function renderSection(title: string, sectionItems: ListItem[], sectionKey: string): _$ {
    const isCollapsed = collapsed[sectionKey] ?? false;
    const sectionDiv = $(
      `
      <div class="folder-row ${isCollapsed ? "folder-collapsed" : ""}">
        <div class="browser-list-head browser-list-head-0">${title}</div>
        <div class="browser-list-albums"></div>
      </div>`,
    );
    sectionDiv.attachData({ sectionKey });
    const albumsContainer = $(".browser-list-albums", sectionDiv);

    if (!isCollapsed) {
      for (const item of sectionItems) {
        albumsContainer.append(renderItem(item));
      }
    }

    return sectionDiv;
  }

  async function render() {
    folders.empty();


    // Render shortcuts section
    if (shortcutItems.length > 0) {
      folders.append(renderSection(t("shortcuts"), shortcutItems, "shortcuts"));
    }

    // Render folders by year
    for (const [year, yearFolders] of Array.from(foldersByYear.entries()).sort()) {
      folders.append(renderSection(year, yearFolders, `folders-${year}`));
    }

    // Render projects section
    if (projectItems.length > 0) {
      folders.append(renderSection(t("Projects"), projectItems, "projects"));
    }

    // Render persons section
    if (personItems.length > 0) {
      folders.append(renderSection(t("Persons"), personItems, "persons"));
    }
  }

  // Initial render
  buildItemsFromCache();
  await render();

  // Listen for cache updates
  const unregs: (() => void)[] = [];

  unregs.push(albumCache.emitter.on("albumsChanged", async () => {
    buildItemsFromCache();
    await render();
  }));

  unregs.push(shortcutCache.emitter.on("shortcutsChanged", async () => {
    buildItemsFromCache();
    await render();
  }));

  unregs.push(contactCache.emitter.on("contactsChanged", async () => {
    buildItemsFromCache();
    await render();
  }));

  unregs.push(projectCache.emitter.on("projectsChanged", async () => {
    buildItemsFromCache();
    await render();
  }));

  unregs.push(albumCache.emitter.on("albumUpdated", async ({ album }) => {
    buildItemsFromCache();
    await render();
  }));

  unregs.push(albumCache.emitter.on("albumAdded", async ({ album }) => {
    buildItemsFromCache();
    await render();
  }));

  unregs.push(albumCache.emitter.on("albumRemoved", async ({ album }) => {
    buildItemsFromCache();
    await render();
  }));

  function addListeners(container: _$) {
    const img = new Image();
    img.src = "resources/images/icons/actions/duplicate-50.png";
    let dropTarget: HTMLElement | undefined;
    container
      .on("click", function (ev) {
        console.info("click");
        const item = $(ev.target as HTMLElement);
        if (item.hasClass("browser-list-head")) {
          const sectionKey = item.parent().getData().sectionKey;
          if (sectionKey) {
            collapsed[sectionKey] = !collapsed[sectionKey];
            render();
          }
          return true;
        }
        const listItem = $(item.get().closest(".browser-list-text"));
        if (!listItem.exists()) return true;
        const itemData = listItem.getData().item as ListItem;
        if (!itemData) return true;
        albumListEvents.emit("selected", itemData);
        return true;
      })
      .on("dblclick", async function (ev) {
        console.info("dblclick");
        const item = $(ev.target as HTMLElement);
        const listItem = $(item.get().closest(".browser-list-text"));
        if (!listItem.exists()) return;
        const itemData = listItem.getData().item as ListItem;
        if (!itemData) return;
        const album = itemData.album;
        if (!album) return;
        const media = await getAlbumContents(album);
        selectionManager.setSelection(media.entries);
      })
      .on("dragenter", (ev: DragEvent) => {
        ev.preventDefault();
        ev.dataTransfer?.setDragImage(img, 0, 0);
      })
      .on("dragleave", (ev: DragEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (
          ev.target &&
          $(ev.target! as HTMLElement).hasClass("browser-list-text")
        ) {
          if (dropTarget) {
            $(dropTarget).removeClass("drop-area");
            dropTarget = undefined;
          }
        }
      })
      .on("dragover", (ev: DragEvent) => {
        ev.stopPropagation();
        ev.preventDefault();
        if (
          ev.target &&
          $(ev.target! as HTMLElement).hasClass("browser-list-text") &&
          ev.target !== dropTarget
        ) {
          if (dropTarget) {
            $(dropTarget).removeClass("drop-area");
          }
          dropTarget = ev.target! as HTMLElement;
          const item = $(dropTarget);
          item.addClass("drop-area");
          ev.dataTransfer!.setDragImage(img, 10, 10);
        }
      })
      .on("drop", async (ev: any) => {
        ev.stopPropagation();
        if (dropTarget) {
          $(dropTarget).removeClass("drop-area");
          const item = $(dropTarget);
          const selection = selectionManager.selected();
          const listItem = $(item.get().closest(".browser-list-text"));
          if (!listItem.exists()) return;
          const itemData = listItem.getData().item as ListItem;
          if (!itemData) return;
          const album = itemData.album;
          if (album) {
            const s = await getService();

            if (selection.length === 0) {
              throw new Error("No selection");
            }
            console.info("Moving selection to album", selection, album);

            s.createJob(JOBNAMES.MOVE, {
              source: selection,
              destination: { album },
            });
          }
          selectionManager.clear();
        }
      });
  }

  addListeners(container);

  container.attachData({ unregs });

  return container;
}
