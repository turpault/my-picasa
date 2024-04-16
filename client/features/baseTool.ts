import { PicasaFilter, isPicture, substitute } from "../../shared/lib/utils";
import { ImageController } from "../components/image-controller";
import { t } from "../components/strings";
import { ToolEditor } from "../components/tool-editor";
import {
  cloneContext,
  destroyContext,
  encode,
  transform,
} from "../imageProcess/client";
import { $, _$, bindStateToControl } from "../lib/dom";
import { State } from "../lib/state";
import { AlbumEntry } from "../types/types";

export type ToolRegistrarEvents = {
  added: { tool: Tool };
  activate: { index: number; tool: Tool };
  preview: { operation: PicasaFilter | null };
};
export interface Tool {
  filterName: string;
  displayName: string;
  ui(): _$;
  enable(e: AlbumEntry): boolean;
  update?(operations: PicasaFilter[], thumbnailContext: string): Promise<void>;
  build(..._args: any[]): PicasaFilter;
}

export class ActivableTool implements Tool {
  constructor(
    public displayName: string,
    public filterName: string,
    public controller: ImageController,
    public editable: boolean = false
  ) {}
  enable(e: AlbumEntry): boolean {
    return isPicture(e);
  }
  async activate(): Promise<boolean> {
    throw "notImplemented";
  }
  icon() {
    throw "notImplemented";
  }
  build(): PicasaFilter {
    throw "notImplemented";
  }
  ui() {
    return $(
      `<div class="tool-button"><label>${this.displayName}</label></div>`
    )
      .on("click", () => this.activate())
      .css({
        "background-image": `url(${this.icon()})`,
        border: "none",
      });
  }
}

type Parameter = {
  name: string;
  type: "range" | "text" | "color";
  range?: { min: number; max: number };
  default: number | string;
};
type ParameterStateDef = {
  [key: string]: number | string;
};

function toStateDef(
  parameters: Parameter[],
  operation: PicasaFilter
): ParameterStateDef {
  const args = operation.args.slice(1);
  const res: ParameterStateDef = {};
  for (const param of parameters) {
    const value = args.shift();
    if (value === undefined) {
      throw "Missing value";
    }
    res[param.name] = value;
  }
  return res;
}
export function toolHTML(
  name: string,
  details: string,
  icon: string,
  ok: Function,
  cancel: Function,
  trash: Function
): {
  toolElement: _$;
  controls: _$;
  okCancel: _$;
} {
  const s = substitute(parametrizableToolControlHtml, {
    ICON: icon,
    NAME: name,
    DETAILS: details,
  });
  const toolElement = $(s);
  const controls = $(".parametrizable-tool-controls", toolElement);
  const okCancelContainer = $(
    ".parametrizable-tool-controls-okcancel",
    toolElement
  );
  const okCancel = okCancelHtml(ok, cancel, trash);
  okCancelContainer.append(okCancel);
  return { toolElement, controls, okCancel };
}

function okCancelHtml(ok: Function, cancel: Function, trash: Function) {
  const h = $(`
    <div class="parametrizable-tool-controls-okcancel">
      <picasa-button type="ok" class="parametrizable-tool-control-ok">${t(
        "Apply"
      )}</picasa-button>
      <picasa-button type="cancel" class="parametrizable-tool-control-cancel">${t(
        "Cancel"
      )}</picasa-button>
      <picasa-button type="trash" class="parametrizable-tool-control-trash">      
      </picasa-button>
    </div>
  `);
  $(".parametrizable-tool-control-ok", h).on("click", (ev: MouseEvent) =>
    ok(ev)
  );
  $(".parametrizable-tool-control-cancel", h).on("click", (ev: MouseEvent) =>
    cancel(ev)
  );
  $(".parametrizable-tool-control-trash", h).on("click", (ev: MouseEvent) =>
    trash(ev)
  );
  return h;
}
const parametrizableToolControlHtml = `
<div class="parametrizable-tool-controls-pane">
  <div class="parametrizable-tool-controls-title">
  <img class="parametrizable-tool-controls-icon" src="$ICON$">
  <h1>${t("$NAME$")}</h1>
  <h3>${t("$DETAILS$")}</h3>
  </div>
  <div class="parametrizable-tool-controls"></div>
  <div class="parametrizable-tool-controls-okcancel"></div>
</div>
`;

export class ParametrizableTool implements Tool {
  constructor(
    public displayName: string,
    public filterName: string,
    public controller: ImageController,
    private toolEditor: ToolEditor,
    private parameters: Parameter[],
    private icon?: string,
    private details?: string
  ) {}
  private iconElement?: _$;
  async update(
    operations: PicasaFilter[],
    thumbnailContext: string
  ): Promise<void> {
    if (this.iconElement) {
      this.iconElement.css({
        "background-image": `url("resources/images/spinning-gear.gif")`,
      });
      if (this.controller.hasFilter(this.filterName)) {
        this.iconElement.css({ border: "solid 1px blue" });
      } else {
        this.iconElement.css({ border: "none" });
      }
      const copy = await cloneContext(
        thumbnailContext,
        `toolminiicon-${this.displayName}`
      );
      (async () => {
        if (!this.controller.hasFilter(this.filterName)) {
          await transform(copy, [this.build()]);
        }
        const encoded = await encode(copy, "image/jpeg", "base64url");
        this.icon = encoded.data as string;
        this.iconElement.css({
          "background-image": `url(${encoded.data})`,
        });
        await destroyContext(copy);
      })();
    }
  }
  enable(e: AlbumEntry): boolean {
    return isPicture(e);
  }
  async activate(): Promise<boolean> {
    let index = this.controller
      .operations()
      .findIndex((o) => o.name === this.filterName);

    if (this.parameters.length === 0) {
      this.controller.toggleOperation(this.filterName);
      return true;
    }

    let operation: PicasaFilter;
    const isNew = index === -1;
    if (index !== -1) {
      operation = this.controller.operations()[index];
    } else {
      operation = this.build();
      index = await this.controller.addOperation(operation);
    }
    return new Promise<boolean>((resolve) => {
      const originalOperationValue = operation.args.slice();

      const state = new State<ParameterStateDef>();
      state.setValues(toStateDef(this.parameters, operation));

      const ok = () => {
        this.toolEditor.deactivate();
        resolve(true);
      };
      const cancel = () => {
        if (isNew) {
          // cancel creation
          this.controller.deleteOperation(this.filterName);
        } else {
          operation.args = originalOperationValue;
          this.controller.updateOperation(operation, index);
        }
        this.toolEditor.deactivate();
        resolve(false);
      };
      const trash = () => {
        this.toolEditor.deactivate();
        this.controller.deleteOperation(this.filterName);
        resolve(true);
      };
      const { toolElement, controls } = toolHTML(
        this.displayName,
        this.details ?? "",
        this.icon ?? "",
        ok,
        cancel,
        trash
      );

      for (const param of this.parameters) {
        switch (param.type) {
          case "range":
            {
              const ctrl = $(`
          <div>
          <label>${t(param.name)}</label>
            <input is="picasa-slider" min="${param.range!.min}" max="${
                param.range!.max
              }" value="${state.getValue(param.name)}" ticks="${
                param.default
              }" class="parametrizable-tool-controls-slider">
          </div>`);
              const input = $(".parametrizable-tool-controls-slider", ctrl);
              bindStateToControl(state, input, param.name);
              controls.append(ctrl);
            }
            break;
          case "text":
            {
              const ctrl = $(`
            <div>
            <label>${t(param.name)}</label>
              <input class="parametrizable-tool-controls-input" value="${state.getValue(
                param.name
              )}">
            </div>`);
              const input = $(".parametrizable-tool-controls-input", ctrl);
              bindStateToControl(state, input, param.name);
              controls.append(ctrl);
            }
            break;
          case "color":
            {
              const ctrl = $(`
              <div>
              <label>${t(param.name)}</label>
                <input type="color" class="parametrizable-tool-controls-colorpicker" value="${state.getValue(
                  param.name
                )}">
              </div>`);
              const input = $(
                ".parametrizable-tool-controls-colorpicker",
                ctrl
              );
              bindStateToControl(state, input, param.name);
              controls.append(ctrl);
            }
            break;
          default:
            throw "notImplemented";
        }
      }

      state.events.on("*", () => {
        const operationArgsFromState = this.parameters
          .map((p) => state.getValue(p.name))
          .map((v) => v.toString());
        operation.args = ["1", ...operationArgsFromState];
        this.controller.updateOperation(operation, index);
      });

      this.toolEditor.activate(toolElement);
    });
  }
  ui() {
    this.iconElement = $(
      `<div class="tool-button"><label>${this.displayName}</label></div>`
    )
      .on("click", () => this.activate())
      .on("mouseenter", () => {
        this.controller.preview(this.build());
      })
      .on("mouseleave", () => {
        this.controller.preview(null);
      })
      .css({
        "background-image": `url(${this.icon ?? ""})`,
        border: "none",
      });
    return this.iconElement;
  }
  build(): PicasaFilter {
    return {
      name: this.filterName,
      args: ["1", ...this.parameters.map((p) => p.default.toString())],
    };
  }
}

export class FilterTool extends ParametrizableTool {
  constructor(
    public displayName: string,
    public filterName: string,
    public controller: ImageController,
    toolEditor: ToolEditor
  ) {
    super(displayName, filterName, controller, toolEditor, []);
  }
}
