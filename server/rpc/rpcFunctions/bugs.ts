import { mkdir, readFile, readdir, writeFile } from "fs/promises";
import { uuid } from "../../../shared/lib/utils";
import { bugsFolder } from "../../utils/constants";
import { join } from "path";
import { Bug } from "../../../shared/types/types";
import { sendSlackMessage } from "../../utils/slack";
import { error } from "console";

export async function addBug(description: string) {
  await mkdir(bugsFolder, { recursive: true });
  const bug: Bug = {
    description,
    priority: 1,
    status: "open",
    created: new Date(),
  };
  const bugId = uuid();
  await writeFile(join(bugsFolder, bugId + ".json"), JSON.stringify(bug));
  sendSlackMessage(description, "bugs").catch(error);
}

export async function getBugs(): Promise<Bug[]> {
  await mkdir(bugsFolder, { recursive: true });
  const files = await readdir(bugsFolder);
  const bugs: Bug[] = [];
  for (const file of files) {
    const bug = JSON.parse(
      await readFile(join(bugsFolder, file), { encoding: "utf-8" }),
    );
    bugs.push(bug);
  }
  return bugs;
}
