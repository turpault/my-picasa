import { _$ } from "./lib/dom";
import { Emitter } from "./lib/event";
import { PicasaFilter } from "./lib/utils";
import { AlbumEntrySelectionManager } from "./selection/selection-manager";
import { Album, AlbumEntry, Node } from "./types/types";

type iconFct = (context: string, original: string) => Promise<boolean>;
type activateFct = (index: number, args?: string[]) => Promise<boolean>;
type entryFct = (e: AlbumEntry) => boolean;

export type Tool = {
  filterName: string;
  enable: entryFct;
  editable?: boolean;
  preview?: boolean;
  icon: iconFct;
  build: (...args: any[]) => PicasaFilter;
  buildUI: (
    index: number,
    args: string[],
    context: string
  ) => { ui: HTMLElement; clearFct?: Function };
  activate: activateFct;
  multipleFamily: string | null;
};

export type PanZoomEvent = {
  pan: { x: number; y: number };
  zoom: { scale: number };
};

export type ImageControllerEvent = {
  updated: {
    context: string;
    liveContext: string;
    caption: string;
    filters: PicasaFilter[];
  };
  liveViewUpdated: {
    context: string;
    original: string;
    entry: AlbumEntry;
  };
  idle: {};
  busy: {};
  operationListChanged: {};
  displayed: {};
  visible: { info: any; entry: AlbumEntry };
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
  };
  browserSelectionChanged: {
    selection: AlbumEntry[];
  };
  // Well-known events sourced from tabs
  edit: { initialList: AlbumEntry[]; initialIndex: number };
  show: { initialList: AlbumEntry[]; initialIndex: number };
  editSelect: { entry: AlbumEntry };
  mosaic: { initialList: AlbumEntry[]; initialIndex: number };
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
  filterChanged: {
    filter: string;
  };
  ready: {};
  nodeChanged: {
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
