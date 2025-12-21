import { WriteStream, createReadStream, createWriteStream } from "fs";
import { readFile } from "fs/promises";
import { join } from "path";
import { createInterface } from "readline";
import { uuid } from "../../shared/lib/utils";
import { UndoStep } from "../../shared/types/types";
import { imagesRoot } from "./constants";
import { broadcast } from "./socketList";
import { fileExists } from "./serverUtils";

let undoStream: WriteStream;
let undoneStream: WriteStream;
const undoFile = join(imagesRoot, ".mypicasa.undo");
const undoneFile = join(imagesRoot, ".mypicasa.undone");
export async function initUndo() {
  undoStream = createWriteStream(undoFile, {
    flags: "a",
    encoding: "utf-8",
  });
  undoneStream = createWriteStream(undoneFile, {
    flags: "a",
    encoding: "utf-8",
  });
}

export async function addToUndo(
  operation: string,
  description: string,
  payload: any,
) {
  const item: UndoStep = {
    uuid: uuid(),
    description,
    timestamp: new Date().getTime(),
    operation,
    payload,
  };
  undoStream.write(`${JSON.stringify(item)}\n`);
  const undoSteps = await undoList();
  broadcast("undoChanged", { undoSteps });
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
          op.payload as object,
        );
        undoneStream.write(`${id}\n`);
        const undoSteps = await undoList();
        broadcast("undoChanged", { undoSteps });
      }
    }
  }
}

export async function undoList(): Promise<UndoStep[]> {
  if ((await fileExists(undoFile)) === false) return [];
  return new Promise<UndoStep[]>(async (resolve, reject) => {
    const readUndo = createReadStream(undoFile, { encoding: "utf-8" });
    const undoneOperations = (
      await readFile(undoneFile, { encoding: "utf-8" }).catch((e) => "")
    ).split("\n");
    const res: UndoStep[] = [];
    const reader = createInterface(readUndo);

    reader.on("line", (line) => {
      try {
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
      } catch (e) {
        // Skip invalid JSON lines
        console.error(`Error parsing undo entry: ${e}`);
      }
    });

    reader.on("close", () => {
      readUndo.destroy(); // Explicitly close the stream
      resolve(res.slice(-10));
    });

    reader.on("error", (error) => {
      readUndo.destroy();
      reject(error);
    });

    readUndo.on("error", (error) => {
      reader.close();
      reject(error);
    });
  });
}
