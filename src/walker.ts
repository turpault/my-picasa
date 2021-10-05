export async function walk(dir: any) {
    for await (const [name, handle] of dir) {
        if (handle.kind == "directory") {
            // console.info(name + '... is a directory');
            await walk(handle);
        } else {
            // console.info(name + '... is a file');
        }
    }
}
export async function fileTree() {
    const root = await (window as any).showDirectoryPicker();
    console.time("Walk photos");
    await walk(root);
    console.timeEnd("Walk photos");
}
