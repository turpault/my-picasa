import { ImageController } from "../components/image-controller";
import { ToolEditor } from "../components/tool-editor";
import { PAGES, ToolRegistrar } from "../components/tools";
import { getService } from "../rpc/connect";
import { FilterTool } from "./baseTool";

export async function setupFilters(
  controller: ImageController,
  toolRegistrar: ToolRegistrar,
  editor: ToolEditor
) {
  const s = await getService();
  const groups = (await s.getFilterGroups()) as string[];
  groups.forEach(async (group) => {
    const filterList = await s.getFilterList(group);
    for (const filter of [...filterList]) {
      toolRegistrar.registerTool(
        group as PAGES,
        new FilterTool(filter, `filter:${filter}`, controller, editor)
      );
    }
  });
}
