import { ImageController } from "../components/image-controller";
import { t } from "../components/strings";
import { ToolEditor } from "../components/tool-editor";
import { PAGES, ToolRegistrar } from "../components/tools";
import { getService } from "../rpc/connect";
import { ParametrizableTool } from "./baseTool";

export async function setupConvolutions(
  controller: ImageController,
  toolRegistrar: ToolRegistrar,
  editor: ToolEditor
) {
  const s = await getService();
  const kernels = (await s.getConvolutionKernelNames()) as string[];
  toolRegistrar.registerTool(
    PAGES.CONTRAST,
    new ParametrizableTool(t("Filter"), `convolute`, controller, editor, [
      {
        name: "Kernel",
        type: "select",
        options: kernels,
        default: kernels[0],
      },
    ])
  );
}
