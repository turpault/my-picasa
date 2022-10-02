import chalk from "chalk";

export async function clientLog(action: string, data: string) {
  const mc = console as any;
  mc[action](chalk.bold(...data));
}

export async function clientException(message: string, file: string, line: string, col: string, error: string) {  
  console.error(chalk.bold(chalk.bgRed(message, file, line, col, error)));
}