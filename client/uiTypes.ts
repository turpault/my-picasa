import { _$ } from "./lib/dom";
import { Emitter } from "./lib/event";
import { Album, AlbumEntry } from "./types/types";

type iconFct = (context: string) => Promise<boolean>;
type activateFct = (index: number, args?: string[]) => Promise<boolean>;
type entryFct = (e: AlbumEntry) => boolean;

export type Tool = {
  filterName: string;
  enable: entryFct;
  editable?: boolean;
  icon: iconFct;
  build: Function;
  buildUI: (index: number, args: string[], context: string) => { ui: HTMLElement, clearFct?: Function };
  activate: activateFct;
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
    filters: string;
  };
  liveViewUpdated: {
    context: string;
    entry: AlbumEntry;
  };
  idle: {};
  busy: {};
  operationListChanged: {};
};

export type AppEvent = {
  ready: {
    state: boolean
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
  };
  keyDown: {
    code: string;
    win: _$;
  };
  // Well-known events sourced from tabs
  edit: { initialList: AlbumEntry[]; initialIndex: number };
  show: { initialList: AlbumEntry[]; initialIndex: number };
  composite: { initialList: AlbumEntry[]; initialIndex: number };
};

export type AppEventSource = Emitter<AppEvent>;

export type AlbumListEvent = {
  selected: { album: Album };
  scrolled: { album: Album };
  invalidateFrom: {
    index: number;
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
};
export type AlbumListEventSource = Emitter<AlbumListEvent>;
