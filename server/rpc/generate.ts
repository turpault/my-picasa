import { writeFileSync } from "fs";
import { join } from "path";
import { MyPicasa } from "./my-picasa";
import { generateCode } from "./rpcCompiler";

const location =
  process.argv[2] || join(__dirname, "..", "..", "generated-rpc");
console.info("Generating RPC interface at the following location : ", location);
generate(location);

export function generate(folder: string): void {
  console.info("Generating MyPicasa interface");
  const MyPicasaIf = generateCode(MyPicasa);
  writeFileSync(join(folder, `${MyPicasaIf.className}.ts`), MyPicasaIf.tscode);
  console.info("done");
}
