import {
  albumEntryFromId,
  cssSplitValue,
  idFromAlbumEntry,
} from "../../shared/lib/utils";
import { Album, AlbumEntry, AlbumKind } from "../types/types";
import { State, StateDef } from "./state";

export function NodeListToFirstElem(
  e: HTMLElement | NodeListOf<HTMLElement> | undefined
): HTMLElement | undefined {
  if (e instanceof NodeList) {
    return e.item(0);
  }
  return e;
}

export function NodeListToArray(
  e: HTMLElement | NodeListOf<HTMLElement> | undefined
): HTMLElement[] | undefined {
  if (e instanceof NodeList) {
    return Array.from(e.values());
  }
  return [e] as HTMLElement[];
}

export function setImageDataToCanvasElement(
  imagedata: ImageData,
  canvas: HTMLCanvasElement
): void {
  var ctx = canvas.getContext("2d")!;
  canvas.width = imagedata.width;
  canvas.height = imagedata.height;

  ctx.putImageData(imagedata, 0, 0);
}

export class _$<T extends HTMLElement = HTMLElement> {
  constructor(e: Element | T | string | _$, from?: HTMLElement | null | _$) {
    this._e = e ? this.resolve(e, from || null) : null;
  }
  static fromId(id: string): _$ {
    const byId = document.getElementById(id);
    return new _$(byId);
  }
  id(val: string): _$;
  id(): string;
  id(val?: string): string | _$ {
    if (val !== undefined) {
      this.get().id = val;
      return this;
    } else {
      return this.get().id;
    }
  }
  on<K extends keyof HTMLElementEventMap>(
    type: K,
    listener: (this: _$, ev: HTMLElementEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions
  ): _$ {
    this.get().addEventListener(
      type,
      (...args) => {
        listener.call(this, ...args);
      },
      options
    );
    return this;
  }
  off<K extends keyof HTMLElementEventMap>(
    type: K,
    listener: (this: _$, ev: HTMLElementEventMap[K]) => any
  ): _$ {
    this.get().removeEventListener(type, (...args) => {
      listener.call(this, ...args);
    });
    return this;
  }
  get(): T {
    if (!this._e) {
      throw new Error("No element");
    }
    return this._e;
  }
  exists(): boolean {
    return !!this._e;
  }
  optional(): _$ | undefined {
    return this.exists() ? this : undefined;
  }
  proxy(): _$ {
    if (this._e) {
      return this;
    }
    return new Proxy(
      {},
      {
        get: () => {
          return () => this;
        },
      }
    ) as _$;
  }
  attachData(data: { [key: string]: any }): _$ {
    (this.get() as any)._data = {
      ...((this.get() as any)._data || {}),
      ...data,
    };
    return this;
  }
  replaceWith(e: _$): _$ {
    this.get().replaceWith(e.get());
    return this;
  }
  getData(): { [key: string]: any } {
    return (this.get() as any)._data || {};
  }
  val(value?: any) {
    if (arguments.length === 0) {
      return (this.get() as any).value;
    }

    (this.get() as any).value = value;

    return this;
  }
  absolutePosition(pos: { x: number; y: number }) {
    this.css("position", "absolute");
    this.css("left", `${pos.x}px`);
    this.css("top", `${pos.y}px`);
    return this;
  }
  text(value: any): _$;
  text(value?: any): _$ | string {
    const nodes = this.get().childNodes;
    let found = false;
    for (var i = 0; i < nodes.length; i++) {
      // Check for a text node
      if (nodes[i].nodeType === 3) {
        if (arguments.length === 0) {
          return nodes[i].textContent || "";
        }
        nodes[i].textContent = value;
        found = true;
        break;
      }
    }
    if (!found) {
      if (arguments.length === 0) {
        return "";
      }

      this.get().appendChild(document.createTextNode(value));
    }

    return this;
  }
  innerHTML(html?: string) {
    if (html === undefined) {
      return this.get()!.innerHTML;
    }
    this.get()!.innerHTML = html;
    return this;
  }
  cssDelta(name: string, value: number, priority?: string): _$ | string {
    let current = this.css(name);
    const c = cssSplitValue(current);
    if (isNaN(c.value)) {
      throw new Error("Not a parsable value");
    }
    return this.css(name, `${c.value! + value}${c.unit}`, priority);
  }
  css(name: string): string;
  css(name: object): _$;
  css(name: string, value: any): _$;
  css(name: string, value: any, priority: string | undefined): _$;
  css(name: string | object, value?: any, priority?: string): _$ | string {
    if (value !== undefined) {
      if (typeof name == "string") {
        if (Array.isArray(value)) {
          return this.css(name, ...(value as [value: any, priority?: string]));
        } else {
          this.get().style.setProperty(name, value as string, priority);
        }
      } else {
        throw new Error("Can only set single name/values");
      }
      return this;
    } else {
      if (typeof name == "object") {
        for (const [key, val] of Object.entries(name)) {
          this.css(key, val);
        }
        return this;
      } else if (typeof name == "string") {
        return this.get().style[name as keyof CSSStyleDeclaration] as string;
      } else throw new Error("Can only read discrete values");
    }
  }
  hide() {
    this.css("display", "none");
  }
  show(show = true) {
    if (!show) return this.hide();
    this.css("display", null);
  }
  clientRect(): DOMRect {
    return this.get().getBoundingClientRect();
  }
  append(e: HTMLElement | _$ | string): _$ {
    this.get().appendChild(new _$(e).get());
    return this;
  }
  appendAll(e: (HTMLElement | _$ | string)[]): _$ {
    for (const el of e) this.get().appendChild(new _$(el).get());
    return this;
  }
  insertBefore(e: HTMLElement | _$ | string, before: HTMLElement | _$): _$ {
    this.get().insertBefore(new _$(e).get(), new _$(before).get());
    return this;
  }
  addClass(className: string): _$ {
    var j = 0,
      classes = className ? className.trim().split(/\s+/) : [];

    for (j = 0; j < classes.length; j++) {
      this.get().classList.add(classes[j]);
    }

    return this;
  }
  hasClass(name: string): boolean {
    return this._e?.classList.contains(name) || false;
  }
  addRemoveClass(name: string, condition: boolean) {
    if (condition) {
      this.addClass(name);
    } else {
      this.removeClass(name);
    }
    return this;
  }
  all(selector: string): _$[] {
    return Array.from(this.get().querySelectorAll(selector)).map((e) =>
      $(e as HTMLElement)
    );
  }
  children(): _$[] {
    return Array.from(this.get().children).map((e) => $(e as HTMLElement));
  }
  attr(key: string | object, value?: any): any {
    var args = arguments;

    if (typeof key === "string" && args.length === 1) {
      return this.get().getAttribute(key);
    }

    if (typeof key === "string") {
      if (value === null) {
        this.get().removeAttribute(key);
      } else {
        this.get().setAttribute(key, value);
      }
      return this;
    }
    for (const [name, value] of Object.entries(key)) {
      this.attr(name, value);
    }
    return this;
  }

  remove() {
    this.get().parentElement!.removeChild(this.get());
  }

  isParent(e: HTMLElement | _$) {
    const _e = $(e);
    let p: _$ | null = this;
    while ((p = p.parent())) {
      if (p.get() === _e.get()) {
        return true;
      }
    }
    return false;
  }
  parentElement(): HTMLElement | undefined {
    return this.get().parentElement ? this.get().parentElement! : undefined;
  }

  removeClass(className: string): _$ {
    var j = 0,
      classes = className ? className.trim().split(/\s+/) : [];

    for (j = 0; j < classes.length; j++) {
      this.get()!.classList.remove(classes[j]);
    }

    return this;
  }
  parent(): _$ | null {
    return this.get().parentElement && new _$(this.get().parentElement!);
  }
  visible(): boolean {
    return this.get().offsetParent !== null;
  }

  focus() {
    this.get().focus();
  }

  empty(): _$ {
    this.get().innerHTML = "";
    return this;
  }
  get left(): number {
    return this.get().offsetLeft;
  }
  get top(): number {
    return this.get().offsetTop;
  }
  get width(): number {
    return this.get().clientWidth;
  }
  get height(): number {
    return this.get().clientHeight;
  }

  centerOnLoad(): _$ {
    this.on("load", (e) => {
      const target = e.target as HTMLImageElement;
      const parentSize = {
        width: target.parentElement!.clientWidth,
        height: target.parentElement!.clientHeight,
      };
      const ratio = target.naturalWidth / target.naturalHeight;
      const parentRatio = parentSize.width / parentSize.height;
      let css;
      if (ratio > parentRatio) {
        css = {
          left: "0",
          height: `${parentSize.width / ratio}px`,
          top: `${(parentSize.height - parentSize.width / ratio) / 2}px`,
          width: `${parentSize.width}px`,
        };
      } else {
        css = {
          width: `${parentSize.height * ratio}px`,
          height: `${parentSize.height}px`,
          top: "0",
          left: `${(parentSize.width - parentSize.height * ratio) / 2}px`,
        };
      }

      // position the image
      $(target).css(css);
    });
    return this;
  }

  private resolve(
    e: Element | T | string | _$,
    from: HTMLElement | null | _$
  ): T | null {
    if (e instanceof HTMLElement) {
      return e as T;
    }
    if (e instanceof Element) {
      throw new Error("Bad type");
    }
    if (e instanceof _$) {
      return (e as _$<T>).get();
    }
    if (typeof e === "string" && e.trim().startsWith("<")) {
      const n = document.createElement("div");
      n.innerHTML = e;
      if (n.children.length === 1) {
        return n.children[0] as T;
      } else if (n.children.length > 1) {
        throw new Error("Too many children");
      }
    }

    let _from: HTMLElement | null | Document;
    if (from instanceof _$) {
      _from = from.get();
    } else {
      _from = from;
    }
    if (!_from) {
      _from = document;
    }
    try {
      if (e.startsWith("#")) {
        if (_from !== document) {
          throw new Error(`Get by id should not pass an element`);
        }
        return document.getElementById(e.slice(1)) as T;
      }
      const byId = document.getElementById(e);
      if (byId) {
        return byId as T;
      }
      const bySelector = _from.querySelector(e);
      if (bySelector) {
        return bySelector as T;
      }
    } catch (err) {}
    return null;
  }
  private _e: T | null;
}

export function $<T extends HTMLElement = HTMLElement>(
  e: Element | T | string | _$,
  from: HTMLElement | null | _$ = null
): _$<T> {
  return new _$<T>(e, from);
}

export function preLoadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const i = new Image();
    $(i).css("opacity", 0);
    (window as any).i = i;
    i.onload = () => {
      resolve(i);
    };
    i.onerror = () => {
      i.remove();
      reject();
    };
    i.src = url;
    i.decode()
      .then(() => {})
      .catch((e) => {
        console.error(`While loading ${url}`, e);
      });
  });
}

export function albumEntryIndexInList(
  a: AlbumEntry,
  lst: AlbumEntry[]
): number {
  return lst.findIndex((i) => i.album.key === a.album.key && i.name === a.name);
}

// Name HTML element from/to Album
export function elementFromAlbum(album: Album, qualifier: string) {
  const id = idFromAlbum(album, qualifier);
  return $(id);
}

export function albumFromElement(e: _$, qualifier: string): Album | null {
  return albumFromId(e.id());
}
export function setIdForAlbum(e: _$, album: Album, qualifier: string) {
  e.id(idFromAlbum(album, qualifier));
}
function albumFromId(id: string): Album | null {
  const [qualifier, valid, key, name, kind] = id.split("|");
  if (valid === "album") return { key, name, kind: kind as AlbumKind };
  return null;
}
function idFromAlbum(a: Album, qualifier: string): string {
  return `${qualifier}|album|${a.key}|${a.name}|${a.kind}`;
}

// Name HTML element from/to AlbumEntry
export function elementFromEntry(entry: AlbumEntry, qualifier: string) {
  const id = idFromAlbumEntry(entry, qualifier);
  return _$.fromId(id);
}
export function albumEntryFromElement(
  e: _$,
  qualifier: string
): AlbumEntry | null {
  return albumEntryFromId(e.id().slice(qualifier.length));
}
export function albumEntryFromElementOrChild(
  e: _$,
  qualifier: string
): AlbumEntry | null {
  if (!e || !e.exists()) {
    return null;
  }
  const r = albumEntryFromId(e.id().slice(qualifier.length));
  if (r) {
    return r;
  }
  const p = e.parent();
  if (!p || !p.exists()) {
    return null;
  }
  return albumEntryFromElementOrChild(p, qualifier);
}

export function setIdForEntry(e: _$, entry: AlbumEntry, qualifier: string) {
  e.id(entry ? idFromAlbumEntry(entry, qualifier) : "");
}

export function bindStateToControl<T extends StateDef>(
  state: State<T>,
  control: _$,
  name: keyof T
) {
  state.events.on(name, (value) => {
    control.val(value);
  });
  control.on("input", () => {
    const value = control.val();
    state.setValue(name, value);
  });
}
