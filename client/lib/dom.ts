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
/*export function $(selector: string): HTMLElement | undefined {
    return NodeListToFirstElem(
        document.getElementById(selector) ||
            document.getElementsByName(selector) ||
            document.querySelector<HTMLElement>(selector)
    );
}

export function $$(selector: string): HTMLElement[] | undefined {
    return NodeListToArray(
        document.getElementById(selector) ||
            document.getElementsByName(selector) ||
            document.querySelector<HTMLElement>(selector)
    );
}
*/

export function setImageDataToCanvasElement(
  imagedata: ImageData,
  canvas: HTMLCanvasElement
): void {
  var ctx = canvas.getContext("2d")!;
  canvas.width = imagedata.width;
  canvas.height = imagedata.height;

  ctx.putImageData(imagedata, 0, 0);
}

class DollarElement {
  constructor(
    e: HTMLElement | string | DollarElement,
    from?: HTMLElement | null | DollarElement
  ) {
    this._e = this.resolve(e, from || null);
  }
  on<K extends keyof HTMLElementEventMap>(
    type: K,
    listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions
  ): DollarElement {
    this.get().addEventListener(type, listener, options);
    return this;
  }
  get(): HTMLElement {
    if (!this._e) {
      throw new Error("No element");
    }
    return this._e;
  }
  val(value?: any) {
    if (arguments.length === 0) {
      return (this.get() as any).value;
    }

    (this.get() as any).value = value;

    return this;
  }
  css(name: string | object, value?: string): DollarElement {
    if (typeof name == "string") {
      (this.get().style as any)[name] = value;
    } else {
      for (const [key, val] of Object.entries(name)) {
        this.css(key, val);
      }
    }
    return this;
  }
  append(e: HTMLElement | DollarElement | string): DollarElement {
    this.get().appendChild(new DollarElement(e).get());
    return this;
  }
  addClass(className: string): DollarElement {
    var j = 0,
      classes = className ? className.trim().split(/\s+/) : [];

    for (j = 0; j < classes.length; j++) {
      this.get().classList.add(classes[j]);
    }

    return this;
  }
  toggleClass(name: string, condition: boolean) {
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

  removeClass(className: string): DollarElement {
    var j = 0,
      classes = className ? className.trim().split(/\s+/) : [];

    for (j = 0; j < classes.length; j++) {
      this.get()!.classList.remove(classes[j]);
    }

    return this;
  }
  parent(): DollarElement {
    return new DollarElement(this.get().parentElement!);
  }

  empty() {
    this.get().innerHTML = "";
  }

  private resolve(
    e: HTMLElement | string | DollarElement,
    from: HTMLElement | null | DollarElement
  ): HTMLElement | null {
    if (e instanceof HTMLElement) {
      return e;
    }
    if (e instanceof DollarElement) {
      return e.get();
    }
    let _from: HTMLElement | null;
    if (from instanceof DollarElement) {
      _from = from.get();
    } else {
      _from = from;
    }
    if (e.startsWith("#")) {
      if (_from) {
        return _from.querySelector(e);
      }
      return document.getElementById(e.slice(1));
    }
    try {
      const f = document.querySelector(e);
      if (f) {
        return f as HTMLElement;
      }
    } catch (e) {}
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
  e: HTMLElement | string,
  from: HTMLElement | null | DollarElement = null
): DollarElement {
  return new DollarElement(e, from);
}
