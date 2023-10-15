import { writeFileSync } from "fs";
import { join } from "path";
import { PicisaClient } from "./my-picasa";
import { generateCode } from "./rpc-compiler";

const location =
  process.argv[2] || join(__dirname, "..", "..", "generated-rpc");
console.info("Generating RPC interface at the following location : ", location);
generate(location);

export function generate(folder: string): void {
  console.info("Generating PicisaClient interface");
  const picasaIf = generateCode(PicisaClient);
  writeFileSync(join(folder, `${picasaIf.className}.ts`), picasaIf.tscode);
  console.info("done");
}
