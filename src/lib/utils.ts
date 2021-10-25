export async function sleep(delay: number) {
  return new Promise((resolve) => setTimeout(resolve, delay * 1000));
}

/*
# Picasa uses a special string format to store crop boxes of
# detected faces and from an applied crop filters. The number encased 
# in the rect64() statement is a 64 bit hexadecimal number:

#     rect64(3f845bcb59418507)

# break this number into 4 16-bit numbers by using substrings:

# '3f845bcb59418507'.substring(0,4) //"3f84"
# '3f845bcb59418507'.substring(4,8) //"5bcb"
# '3f845bcb59418507'.substring(8,12) // "5941"
# '3f845bcb59418507'.substring(12,16) // "8507"  

# convert each obtained substring to an integer and divide it
# by the highest 16-bit number (2^16 = 65536), which should give 0 < results < 1.
# these are the relative coordinates of the crop rectangle (left,top,right,bottom):

# parseInt("3f84",16)/65536 //0.24810791015625  - left
# parseInt("5bcb",16)/65536 //0.3585662841796875 - top
# parseInt("5941",16)/65536 //0.3486480712890625 - right
# parseInt("8507",16)/65536 //0.5196380615234375 - bottom
*/
export function decodeRect(
  rect: string | undefined
): { left: number; top: number; right: number; bottom: number } | undefined {
  if (!rect) {
    return undefined;
  }
  const rectData =
    rect.toLowerCase().match(/rect64\(([0-9a-f]*)\)/) ||
    rect.toLowerCase().match(/([0-9a-f]*)/);
  if (rectData && rectData[1]) {
    const split = rectData[1].padStart(16, "0").match(/.{4}/g)!;
    return {
      left: parseInt(split[0], 16) / 65535,
      top: parseInt(split[1], 16) / 65535,
      right: parseInt(split[2], 16) / 65535,
      bottom: parseInt(split[3], 16) / 65535,
    };
  }
  return undefined;
}

export function encodeRect(rect: {
  left: number;
  top: number;
  right: number;
  bottom: number;
}): string {
  return (
    Math.floor(rect.left * 65535)
      .toString(16)
      .padStart(4, "0") +
    Math.floor(rect.top * 65535)
      .toString(16)
      .padStart(4, "0") +
    Math.floor(rect.right * 65535)
      .toString(16)
      .padStart(4, "0") +
    Math.floor(rect.bottom * 65535)
      .toString(16)
      .padStart(4, "0")
  );
}

export function decodeOperations(
  operations: string
): { name: string; args: string[] }[] {
  const cmds = operations.split(";").filter((v) => v);
  const res: { name: string; args: string[] }[] = [];
  for (const cmd of cmds) {
    res.push(decodeOperation(cmd));
  }
  return res;
}

export function decodeOperation(operation: string): {
  name: string;
  args: string[];
} {
  const [name, argsList] = operation.split("=");
  return { name, args: argsList ? argsList.split(",") : [] };
}
