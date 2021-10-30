export class File {
  constructor(path?: string) {
    this.path = path || "";
  }
  async getFileContents(): Promise<Buffer> {
    return fetch("/file/" + encodeURIComponent(this.path))
      .then((res) => {
        if (res.status === 200) {
          return res.arrayBuffer();
        }
        throw new Error("404");
      })
      .then((ab) => Buffer.from(ab));
  }
  async writeFileContents(data: any): Promise<any> {
    return fetch("/file/" + encodeURIComponent(this.path), {
      method: "POST",
      body: data,
    });
  }
  private path: string;
}
export class Directory {
  constructor(name?: string, path?: string) {
    this.name = name || "";
    this.path = path || "";
  }
  async getFileHandle(sub: string): Promise<File> {
    return new File((this.path ? this.path + "/" : "") + sub);
  }
  async getDirectoryHandle(sub: string): Promise<Directory> {
    return new Directory(sub, (this.path ? this.path + "/" : "") + sub);
  }
  async getFiles(): Promise<
    { name: string; kind: string; handle: File | Directory }[]
  > {
    const files = (await fetch("/folder/" + encodeURIComponent(this.path)).then(
      (body) => body.json()
    )) as {
      name: string;
      kind: string;
    }[];
    return files.map((f) => ({
      ...f,
      handle:
        f.kind === "directory"
          ? new Directory(f.name, (this.path ? this.path + "/" : "") + f.name)
          : new File((this.path ? this.path + "/" : "") + f.name),
    }));
  }
  private path: string;
  name: string;
}
