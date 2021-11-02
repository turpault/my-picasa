import { inspect } from "util";
import { uuid } from "../../shared/lib/utils";
import { SocketAdaptorInterface } from "../../shared/socket/socketAdaptorInterface";
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Describles a client-specific set of options.
 * These options can mutate over time, but always reflect a realtime state of the system.
 */
export type InitializeOptions = {};

export type Service = {
  handler: Function; // The function handler
  arguments: string[]; // The argument list
  noPayload?: boolean; // Does not return any data, just success/failure
};

export type ServiceMap = {
  name: string;
  functions: {
    [key: string]: Service;
  };
  constants: {
    [key: string]: any;
  };
};

export interface SocketContext extends SocketAdaptorInterface {
  id: string;
}

type Validator = Function;
type ValidatorMap = {
  [key: string]: Validator;
};
const validators: ValidatorMap = {
  string: (value: any) =>
    typeof value === "string"
      ? value
      : new Error(`Expected string, got ${typeof value}`),
  istring: (value: any) =>
    typeof value === "string"
      ? value
      : new Error(`Expected string, got ${typeof value}`),
  integer: (value: any) =>
    typeof value === "number"
      ? value
      : new Error(`Expected number, got ${typeof value}`),
  boolean: (value: any) =>
    typeof value === "boolean"
      ? value
      : new Error(`Expected boolean, got ${typeof value}`),
  object: (value: any) => {
    if (typeof value === "string") {
      try {
        if (!value) {
          return {};
        }
        const parsed = JSON.parse(value);
        return parsed;
      } catch (e) {
        return e;
      }
    } else if (typeof value === "object") {
      return value;
    }
    return new Error(`Expected object, got ${typeof value}`);
  },
  ComponentMap: (value: any) => {
    if (typeof value === "string") {
      try {
        if (!value) {
          return {};
        }
        const parsed = JSON.parse(value);
        return parsed;
      } catch (e) {
        return e;
      }
    } else if (typeof value === "object") {
      return value;
    }
    // TODO use JOI here
    return new Error(`Expected string with JSON content, got ${typeof value}`);
  },
  JSONPatch: (value: any) => {
    if (typeof value === "string") {
      try {
        if (!value) {
          return {};
        }
        const parsed = JSON.parse(value);
        return parsed;
      } catch (e) {
        return e;
      }
    } else if (typeof value === "object") {
      // TODO use JOI here (Should be a Operation[])
      return value;
    }
    return new Error(`Expected string with JSON content, got ${typeof value}`);
  },
};

async function getConvertedArguments(
  service: Service,
  args: any
): Promise<Array<any>> {
  const convertedArguments: any[] = [];
  await Promise.all(
    service.arguments.map((argument) => {
      const splitArgument = argument.split(":");
      const argumentName = splitArgument[0];
      const argumentType = splitArgument[1];
      const validator = validators[argumentType];
      if (!validator) {
        throw new Error(
          `Validator for type ${argumentType} does not exist, please validate the spec (Argument name is ${argumentName})`
        );
      }
      const newValue = validator(args[argumentName]);
      if (newValue instanceof Error) {
        throw new Error(
          `Argument ${argumentName} fails the validation checks : ${newValue.message}`
        );
      }
      convertedArguments.push(newValue);
    })
  );

  return convertedArguments;
}

export function registerServices(
  socket: SocketAdaptorInterface,
  services: ServiceMap[],
  dependencies: {}
): void {
  const context: SocketContext = Object.assign(socket, { id: uuid() });

  for (const service of services) {
    Object.keys(service.functions).forEach((name) => {
      socket.on(
        service.name + ":" + name,
        async (payload: any, callback: Function) => {
          const start = new Date();
          // Validate arguments
          if (typeof payload === "string") {
            payload = JSON.parse(payload);
          }

          const serviceFunc = service.functions[name];
          const commandArgs = payload.args;
          let label: string = "";
          try {
            const convertedArguments = await getConvertedArguments(
              serviceFunc,
              commandArgs
            );
            label = `Calling ${name}(${inspect(
              convertedArguments,
              false,
              2,
              true
            ).slice(0, 200)})`;
            console.time(label);
            await serviceFunc
              .handler(...convertedArguments)
              .then((response: any) => {
                callback(null, response);
              });
          } catch (er) {
            const exception = er as Error;
            const errMessage = exception.message;
            console.info(errMessage, exception.stack);
            callback(errMessage);
          } finally {
            console.timeEnd(label);
          }
        }
      );
    });
  }
}
