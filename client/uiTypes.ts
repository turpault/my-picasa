import { META_PAGES } from "./components/metadata-viewer";
import { _$ } from "./lib/dom";
import { Emitter } from "./lib/event";
import { State } from "./lib/state";
import { PicasaFilter } from "./lib/utils";
import { AlbumEntrySelectionManager } from "./selection/selection-manager";
import {
  Album,
  AlbumEntry,
  AlbumWithData,
  Node,
  UndoStep,
} from "./types/types";

export type PanZoomEvent = {
  pan: { x: number; y: number };
  zoom: { scale: number };
};

export type ImageControllerEvent = {
  beforeupdate: {
    caption: string;
    filters: PicasaFilter[];
    entry: AlbumEntry;
  };
  updated: {
    caption: string;
    filters: PicasaFilter[];
    entry: AlbumEntry;
  };
  idle: {};
  busy: {};
  operationListChanged: {};
  displayed: {};
  resized: { info: any; entry: AlbumEntry };
  visible: { info: any; entry: AlbumEntry };
  zoom: { scale: number };
};

export type AppEvent = {
  ready: {
    state: boolean;
  };
  tabChanged: {
    tab: _$;
    win: _$;
  };
  tabDeleted: {
    tab: _$;
    win: _$;
  };
  tabDisplayed: {
    tab: _$;
    win: _$;
    context: TabContext;
  };
  keyDown: {
    code: string;
    key: string;
    meta: boolean;
    ctrl: boolean;
    shift: boolean;
    alt: boolean;
    win: _$;
    preventDefault: () => void;
  };
  // Well-known events sourced from tabs
  /**
   * Edit a single existing albumEntry
   */
  edit: { entry: AlbumEntry | null };
  /**
   * Close the current tab and return to the browser
   */
  returnToBrowser: {};

  /**
   * Create a new mosaic, and display it
   */
  mosaic: { initialList: AlbumEntry[]; initialIndex: number };
  /**
   * Create a new slideshow, and display it
   */
  slideshow: { initialList: AlbumEntry[]; initialIndex: number };
  /**
   * Create a new gallery, and display it
   */
  gallery: { initialList: AlbumEntry[]; initialIndex: number };
};

export type AppEventSource = Emitter<AppEvent>;

export type AlbumListEvent = {
  selected: { album: Album };
  scrolled: { album: Album };
  invalidateFrom: {
    index: number;
    to: number;
  };
  invalidateAt: {
    index: number;
  };
  renamed: {
    oldAlbum: AlbumWithData;
    album: AlbumWithData;
  };
  thumbnailClicked: {
    modifiers: {
      range: boolean;
      multi: boolean;
    };
    entry: AlbumEntry;
  };
  thumbnailDblClicked: {
    entry: AlbumEntry;
  };
  ready: {};
  nodeChanged: {
    node: Node;
  };
  nodeCollapsed: {
    node: Node;
  };
  reset: {};
};

export type DraggableControlPositionEvent = {
  dragged: {
    canvasPosition: { x: number; y: number };
    screenPosition: { x: number; y: number };
  };
};
export type AlbumListEventSource = Emitter<AlbumListEvent>;

export type TabContext = {
  selectionManager: AlbumEntrySelectionManager;
  kind: "Browser" | "Editor" | "Mosaic" | "Gallery" | "Error" | "Slideshow";
};

export type ApplicationSharedStateDef = {
  activeMetaPage: META_PAGES;
  browserSelectionManager: AlbumEntrySelectionManager;
  activeSelectionManager: AlbumEntrySelectionManager;
  undo: UndoStep[];
  activeTab: { tab: _$; win: _$; context: TabContext };
};
export type ApplicationState = State<ApplicationSharedStateDef>;
