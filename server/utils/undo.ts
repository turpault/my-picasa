import { createReadStream, createWriteStream } from "fs";
import { readFile } from "fs/promises";
import { join } from "path";
import { createInterface } from "readline";
import { uuid } from "../../shared/lib/utils";
import { undoStep } from "../../shared/types/types";
import { imagesRoot } from "./constants";
import { broadcast } from "./socketList";

const undoFile = join(imagesRoot, ".mypicasa.undo");
const undoneFile = join(imagesRoot, ".mypicasa.undone");
const undoStream = createWriteStream(undoFile, {
  flags: "a",
  encoding: "utf-8",
});
const undoneStream = createWriteStream(undoneFile, {
  flags: "a",
  encoding: "utf-8",
});

export function addToUndo(
  operation: string,
  description: string,
  payload: any
) {
  undoStream.write(
    `${JSON.stringify({
      uuid: uuid(),
      description,
      timestamp: new Date().getTime(),
      operation,
      payload,
    })}\n`
  );
  broadcast("undoChanged", {});
}

export type doFunction = (operation: string, payload: any) => void;
const registrar: {
  [operation: string]: { undoFct: doFunction };
} = {};

export function registerUndoProvider(type: string, undoFct: doFunction) {
  registrar[type] = { undoFct };
}

export async function undo(id: string) {
  const lst = await undoList();
  for (const op of lst) {
    if (op.uuid === id) {
      const operation = op.operation as string;
      if (registrar[operation]) {
        registrar[operation].undoFct(
          op.operation as string,
          op.payload as object
        );
        undoneStream.write(`${id}\n`);
        broadcast("undoChanged", {});
      }
    }
  }
}

export async function undoList(): Promise<undoStep[]> {
  return new Promise<undoStep[]>(async (resolve) => {
    const readUndo = createReadStream(undoFile, { encoding: "utf-8" });
    const undoneOperations = (
      await readFile(undoneFile, { encoding: "utf-8" }).catch((e) => "")
    ).split("\n");
    const res: undoStep[] = [];
    const reader = createInterface(readUndo);
    reader.on("line", (line) => {
      const op = JSON.parse(line);
      if (undoneOperations.includes(op.uuid)) {
        return;
      }
      res.push({
        description: op.description as string,
        timestamp: (op.timestamp as number) || 0,
        uuid: op.uuid as string,
        operation: op.operation as string,
        payload: op.payload as object,
      });
    });
    reader.on("close", () => resolve(res));
  });
}
