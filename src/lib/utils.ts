export async function sleep(delay: number) {
  return new Promise((resolve) => setTimeout(resolve, delay * 1000));
}

export function decodeRect(
  rect: string | undefined
): { x: number; y: number; width: number; height: number } | undefined {
  if (!rect) {
    return undefined;
  }
  const rectData =
    rect.toLowerCase().match(/rect64\(([0-9a-f]*)\)/) ||
    rect.toLowerCase().match(/([0-9a-f]*)/);
  if (rectData && rectData[0]) {
    const split = rectData[0].match(/.{4}/g)!;
    return {
      x: parseInt(split[0], 16),
      y: parseInt(split[1], 16),
      width: parseInt(split[2], 16),
      height: parseInt(split[3], 16),
    };
  }
  return undefined;
}

export function encodeRect(rect: {
  x: number;
  y: number;
  width: number;
  height: number;
}): string {
  return (
    Math.floor(rect.x).toString(16).padStart(4, "0") +
    Math.floor(rect.y).toString(16).padStart(4, "0") +
    Math.floor(rect.width).toString(16).padStart(4, "0") +
    Math.floor(rect.height).toString(16).padStart(4, "0")
  );
}

export function decodeOperations(
  operations: string
): { name: string; args: string[] }[] {
  const cmds = operations.split(";").filter(v=>v);
  const res: { name: string; args: string[] }[] = [];
  for (const cmd of cmds) {
    const [name, argsList] = cmd.split("=");
    res.push({ name, args: argsList ? argsList.split(",") : [] });
  }
  return res;
}
