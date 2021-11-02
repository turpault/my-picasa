import { getService } from "../rpc/connect.js";

export class File {
  constructor(path?: string) {
    this._path = path || "";
  }
  async getFileContents(): Promise<string> {
    const service = await getService();
    const contents = await service.service.readFileContents(this._path);
    return contents;
  }
  async writeFileContents(data: any): Promise<any> {
    const service = await getService();
    await service.service.writeFileContents(this._path, data);
  }

  path() {
    return this._path;
  }

  private _path: string;
}
export class Directory {
  constructor(name?: string, path?: string) {
    this.name = name || "";
    this._path = path || "";
  }
  async getFileHandle(sub: string): Promise<File> {
    return new File((this._path ? this._path + "/" : "") + sub);
  }
  async getDirectoryHandle(sub: string): Promise<Directory> {
    return new Directory(sub, (this._path ? this._path + "/" : "") + sub);
  }
  async getFiles(): Promise<
    { name: string; kind: string; handle: File | Directory }[]
  > {
    const service = await getService();
    const files = (await service.service.folder(this._path)) as {
      name: string;
      kind: string;
    }[];

    return files.map((f) => ({
      ...f,
      handle:
        f.kind === "directory"
          ? new Directory(f.name, (this._path ? this._path + "/" : "") + f.name)
          : new File((this._path ? this._path + "/" : "") + f.name),
    }));
  }
  path() {
    return this._path;
  }
  private _path: string;
  name: string;
}
