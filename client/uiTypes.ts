import { _$ } from "./lib/dom";
import { Emitter } from "./lib/event";
import { PicasaFilter } from "./lib/utils";
import { AlbumEntrySelectionManager } from "./selection/selection-manager";
import { Album, AlbumEntry, Node } from "./types/types";

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
  browserSelectionChanged: {
    selection: AlbumEntry[];
  };
  // Well-known events sourced from tabs
  edit: { active: boolean };
  show: { initialList: AlbumEntry[]; initialIndex: number };
  mosaic: { initialList: AlbumEntry[]; initialIndex: number };
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
