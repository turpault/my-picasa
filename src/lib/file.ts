export async function getFileContents(
  fh: any,
  format: "base64" | "buffer" | "string" = "base64"
): Promise<string | ArrayBuffer> {
  const file = await fh.getFile();
  let reader = new FileReader();
  if (format === "base64") {
    reader.readAsDataURL(file);
  } else if (format === "buffer") {
    reader.readAsArrayBuffer(file);
  } else {
    reader.readAsText(file);
  }

  return new Promise<string | ArrayBuffer>((resolve, reject) => {
    reader.onload = function () {
      if (reader.result === null) {
        reject(new Error("Empty"));
      } else {
        resolve(reader.result);
      }
    };
    reader.onerror = function () {
      reject(reader.error);
    };
  });
}
