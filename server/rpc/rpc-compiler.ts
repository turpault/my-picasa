import { ServiceMap } from "./rpc-handler";
import { TSCodeTemplate } from "./templates";

export type GeneratedCode = {
  className: string;
  tscode: string;
  utils: string;
};

type ArgumentMap = {
  [key: string]: string;
};

const argumentMapTs: ArgumentMap = {
  string: "string",
  istring: "string",
  integer: "number",
  "string[]": "string[]",
  boolean: "boolean",
  ComponentMap: "ComponentMap",
  JSONPatch: "Operation[]",
  object: "object",
};

export function generateCode(services: ServiceMap): GeneratedCode {
  let tscode = "" + TSCodeTemplate;
  let utils = "";
  const klass = services.name;
  tscode = tscode.replace(/<<CLASS>>/g, klass);

  let headerIncludes = "";
  headerIncludes += `#include <Server/Concurrency/RPC/IRPCClient.h>`;

  let tsfunctionBodies = "";
  let constantsCpp = "";
  let tsconstants = "";

  for (const constantEnum of Object.keys(services.constants)) {
    const constantObject = services.constants[constantEnum];
    tsconstants += `export enum ${constantEnum} {`;
    for (const constantName of Object.keys(constantObject)) {
      constantsCpp += `\n#define ${(
        constantEnum +
        "_" +
        constantName
      ).toUpperCase()}  _DNGH("${constantObject[constantName]}")`;
      tsconstants += `  ${constantName} = "${constantObject[constantName]}",\n`;
    }
    tsconstants += "}\n";
  }

  // tscode
  Object.keys(services.functions).forEach((name) => {
    console.info(name);
    const func = services.functions[name];
    const args = func.arguments;
    // Generate the TS function argument list string
    const tsFunctionArguments = args
      .map((arg) => {
        const argument = arg.split(":");
        const argName = argument[0];
        const argTypeTS = argumentMapTs[argument[1]] || argument[1];
        return argName + ": " + argTypeTS;
      })
      .join(", ");
    // Generate the TS argument list
    const tsFunctionArgList = args
      .map((arg) => {
        const argument = arg.split(":");
        const argName = argument[0];
        return argName;
      })
      .join(", ");

    // Add typescript function body
    tsfunctionBodies += `
  async ${name}(${tsFunctionArguments}):${func.noPayload === true ? "Promise<void>" : "Promise<any>"
      } {
    return this.${func.noPayload === true ? "emitNoPayload" : "emit"
      }('${klass}:${name}', {
      'args': { ${tsFunctionArgList} } 
    });
  }`;
  });
  tscode = tscode.replace(/<<CODE>>/g, tsfunctionBodies);
  tscode = tscode.replace(/<<CONSTANTS>>/g, tsconstants);
  tscode = tscode.replace(/<<VERSION>>/g, "TODO");

  return {
    className: klass,
    tscode,
    utils,
  };
}
