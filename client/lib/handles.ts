import { getService } from "../rpc/connect.js";

export class File {
  constructor(path?: string) {
    this._path = path || "";
  }
  async getFileContents(): Promise<string> {
    const service = await getService();
    const contents = await service.readFileContents(this._path);
    return contents;
  }
  async writeFileContents(data: any): Promise<any> {
    const service = await getService();
    await service.writeFileContents(this._path, data);
  }

  path() {
    return this._path;
  }

  private _path: string;
}
export class Directory {
  constructor(key: string) {
    this.key = key || "";
  }
  static from(key: string) {
    return new Directory(key);
  }
  getFileHandle(sub: string): File {
    return new File((this.key ? this.key + "/" : "") + sub);
  }
  getDirectoryHandle(sub: string): Directory {
    return new Directory((this.key ? this.key + "/" : "") + sub);
  }
  async getFiles(): Promise<
    { name: string; kind: string; handle: File | Directory }[]
  > {
    const service = await getService();
    const files = (await service.folder(this.key)) as {
      name: string;
      kind: string;
    }[];

    return files.map((f) => ({
      ...f,
      handle:
        f.kind === "directory"
          ? new Directory((this.key ? this.key + "/" : "") + f.name)
          : new File((this.key ? this.key + "/" : "") + f.name),
    }));
  }
  path() {
    return this.key;
  }
  private key: string;
}
