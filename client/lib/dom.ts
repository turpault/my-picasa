function NodeListToFirstElem(
  e: HTMLElement | NodeListOf<HTMLElement> | undefined
): HTMLElement | undefined {
  if (e instanceof NodeList) {
    return e.item(0);
  }
  return e;
}

function NodeListToArray(
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

export class _$ {
  constructor(e: HTMLElement | string | _$, from?: HTMLElement | null | _$) {
    this._e = this.resolve(e, from || null);
  }
  on<K extends keyof HTMLElementEventMap>(
    type: K,
    listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions
  ): _$ {
    this.get().addEventListener(type, listener, options);
    return this;
  }
  get(): HTMLElement {
    if (!this._e) {
      throw new Error("No element");
    }
    return this._e;
  }
  is(): boolean {
    return !!this._e;
  }
  alive(): _$ {
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
  val(value?: any) {
    if (arguments.length === 0) {
      return (this.get() as any).value;
    }

    (this.get() as any).value = value;

    return this;
  }
  css(name: string | object, value?: string): _$ {
    if (typeof name == "string") {
      (this.get().style as any)[name] = value;
    } else {
      for (const [key, val] of Object.entries(name)) {
        this.css(key, val);
      }
    }
    return this;
  }
  append(e: HTMLElement | _$ | string): _$ {
    this.get().appendChild(new _$(e).get());
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
  addRemoveClass(name: string, condition: boolean) {
    if (condition) {
      this.addClass(name);
    } else {
      this.removeClass(name);
    }
  }

  attr(key: string | object, value?: any): any {
    var args = arguments;

    if (typeof key === "string" && args.length === 1) {
      return this.get().getAttribute(key);
    }

    if (typeof key === "string") {
      this.get().setAttribute(key, value);
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
    let p: _$ | undefined = this;
    while ((p = p.parentElement())) {
      if (p.get() === _e.get()) {
        return true;
      }
    }
    return false;
  }
  parentElement(): _$ | undefined {
    return this.get().parentElement ? $(this.get().parentElement!) : undefined;
  }

  removeClass(className: string): _$ {
    var j = 0,
      classes = className ? className.trim().split(/\s+/) : [];

    for (j = 0; j < classes.length; j++) {
      this.get()!.classList.remove(classes[j]);
    }

    return this;
  }
  parent(): _$ {
    return new _$(this.get().parentElement!);
  }
  visible(): boolean {
    return this.get().offsetParent !== null;
  }

  empty(): _$ {
    this.get().innerHTML = "";
    return this;
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
    e: HTMLElement | string | _$,
    from: HTMLElement | null | _$
  ): HTMLElement | null {
    if (e instanceof HTMLElement) {
      return e;
    }
    if (e instanceof _$) {
      return e.get();
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
        return document.getElementById(e.slice(1));
      }
      const f = _from.querySelector(e);
      if (f) {
        return f as HTMLElement;
      }
    } catch (err) {}
    const n = document.createElement("div");
    n.innerHTML = e;
    if (n.children.length === 1) {
      return n.children[0] as HTMLElement;
    }
    return null;
  }
  private _e: HTMLElement | null;
}

export function $(
  e: HTMLElement | string | _$,
  from: HTMLElement | null | _$ = null
): _$ {
  return new _$(e, from);
}
