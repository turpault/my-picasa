import { inspect } from "util";
import { lock } from "../../shared/lib/mutex";
import { uuid } from "../../shared/lib/utils";
import { RPCAdaptorInterface } from "../../shared/rpc-transport/rpc-adaptor-interface";
import { busy, lockIdleWorkers, releaseIdleWorkers } from "../utils/busy";
import { rate } from "../utils/stats";
import { captureException } from "../sentry";
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
  imports: { symbol: string, module: string }[];
  name: string;
  functions: {
    [key: string]: Service;
  };
  constants: {
    [key: string]: any;
  };
};

export interface SocketContext extends RPCAdaptorInterface {
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
  number: (value: any) =>
    typeof value === "number"
      ? value
      : new Error(`Expected number, got ${typeof value}`),
  boolean: (value: any) =>
    typeof value === "boolean"
      ? value
      : new Error(`Expected boolean, got ${typeof value}`),
  any: (value: any) => value,

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
  }
};

function getConvertedArguments(
  name: string,
  service: Service,
  args: any,
): Array<any> {
  const convertedArguments: any[] = [];

  service.arguments.forEach((argument) => {
    const splitArgument = argument.split(/\?|\:/);
    const argumentName = splitArgument[0];
    const argumentType = splitArgument[splitArgument.length - 1];
    const validator = validators[argumentType];
    const isOptional = argument.includes("?");
    if (!validator && !isOptional) {
      throw new Error(
        `${name}: Validator for type ${argumentType} does not exist, please validate the spec (Argument name is ${argumentName})`,
      );
    }
    const newValue = validator ? validator(args[argumentName]) : args[argumentName];
    if (newValue instanceof Error) {
      throw new Error(
        `${name} Argument ${argumentName} fails the validation checks : ${newValue.message}`,
      );
    }
    convertedArguments.push(newValue);
  });

  return convertedArguments;
}

export function registerServices(
  socket: RPCAdaptorInterface,
  services: ServiceMap[],
  dependencies: {},
): void {
  const context: SocketContext = Object.assign(socket, { id: uuid() });
  let idx = 0;

  for (const service of services) {
    Object.keys(service.functions).forEach((name) => {
      socket.on(
        service.name + ":" + name,
        async (event: { payload: any; callback: Function }) => {
          const { payload, callback } = event;

          const serviceFunc = service.functions[name];
          const commandArgs = payload.args;
          let label: string = "";
          const lockName = name + "/" + uuid();
          const l = await lock(lockName);
          lockIdleWorkers();
          try {
            const convertedArguments = getConvertedArguments(
              name,
              serviceFunc,
              commandArgs,
            );
            rate(name);
            rate("RPC");

            label = `${(++idx)
              .toString()
              .padStart(4, " ")}: Calling ${name}(${inspect(
                convertedArguments,
                false,
                2,
                true,
              ).slice(0, 200)})`;
            //console.time(label);
            const response = await serviceFunc.handler.bind(socket)(
              ...convertedArguments,
            );

            callback(null, response);
          } catch (er) {
            const exception = er as Error;
            const errMessage = exception.message;
            console.info(errMessage, exception.stack);
            try {
              callback(errMessage);
            } catch (e: any) {
              // Ignore errors on the callback
              console.error(e);
              captureException(e);
            }
          } finally {
            releaseIdleWorkers();
            l();
            busy();
            //console.timeEnd(label);
          }
        },
      );
    });
  }
}
