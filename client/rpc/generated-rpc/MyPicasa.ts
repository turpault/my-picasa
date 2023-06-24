
/* This file is automatically generated, do not edit it */
/* This file is generated from the template located here : /Users/turpault/dev/picisa/server/rpc */
/* Generation date : 2023-06-24T13:41:10.353Z */
export enum Exceptions {}

export class MyPicasa {
  private socket_?: any;
  async initialize(socket: any): Promise<void> {
    this.socket_ = socket;
  }

  public on(event: string, cb: Function): Function {
    return this.socket_.on(event, cb);
  }

  // @ts-ignore
  private async emitNoPayload(command: string, payload: any): Promise<void> {
    return this.emit(command, payload);
  }

  private async emit(command: string, payload: any): Promise<any> {
    return new Promise((resolve, reject) =>
      this.socket_.emit(command, payload, (error:string, response:string) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      })
    );
  }

  async buildContext(entry: object):Promise<any> {
    return this.emit('MyPicasa:buildContext', {
      'args': { entry } 
    });
  }
  async cloneContext(context: string, hint: string):Promise<any> {
    return this.emit('MyPicasa:cloneContext', {
      'args': { context, hint } 
    });
  }
  async destroyContext(context: string):Promise<any> {
    return this.emit('MyPicasa:destroyContext', {
      'args': { context } 
    });
  }
  async transform(context: string, operations: string):Promise<any> {
    return this.emit('MyPicasa:transform', {
      'args': { context, operations } 
    });
  }
  async setOptions(context: string, options: object):Promise<any> {
    return this.emit('MyPicasa:setOptions', {
      'args': { context, options } 
    });
  }
  async execute(context: string, operations: object):Promise<any> {
    return this.emit('MyPicasa:execute', {
      'args': { context, operations } 
    });
  }
  async commit(context: string):Promise<any> {
    return this.emit('MyPicasa:commit', {
      'args': { context } 
    });
  }
  async encode(context: string, mime: string, format: string):Promise<any> {
    return this.emit('MyPicasa:encode', {
      'args': { context, mime, format } 
    });
  }
  async getJob(hash: string):Promise<any> {
    return this.emit('MyPicasa:getJob', {
      'args': { hash } 
    });
  }
  async waitJob(hash: string):Promise<any> {
    return this.emit('MyPicasa:waitJob', {
      'args': { hash } 
    });
  }
  async createJob(jobName: string, jobData: object):Promise<any> {
    return this.emit('MyPicasa:createJob', {
      'args': { jobName, jobData } 
    });
  }
  async folders(filter: string):Promise<any> {
    return this.emit('MyPicasa:folders', {
      'args': { filter } 
    });
  }
  async monitorAlbums():Promise<any> {
    return this.emit('MyPicasa:monitorAlbums', {
      'args': {  } 
    });
  }
  async media(album: object):Promise<any> {
    return this.emit('MyPicasa:media', {
      'args': { album } 
    });
  }
  async mediaCount(album: object):Promise<any> {
    return this.emit('MyPicasa:mediaCount', {
      'args': { album } 
    });
  }
  async readFileContents(file: string):Promise<any> {
    return this.emit('MyPicasa:readFileContents', {
      'args': { file } 
    });
  }
  async writeFileContents(file: string, data: string):Promise<any> {
    return this.emit('MyPicasa:writeFileContents', {
      'args': { file, data } 
    });
  }
  async folder(folder: string):Promise<any> {
    return this.emit('MyPicasa:folder', {
      'args': { folder } 
    });
  }
  async sortAlbum(album: object, sort: string):Promise<any> {
    return this.emit('MyPicasa:sortAlbum', {
      'args': { album, sort } 
    });
  }
  async setRank(entry: string, rank: number):Promise<any> {
    return this.emit('MyPicasa:setRank', {
      'args': { entry, rank } 
    });
  }
  async readAlbumMetadata(album: object):Promise<any> {
    return this.emit('MyPicasa:readAlbumMetadata', {
      'args': { album } 
    });
  }
  async exifData(entry: object):Promise<any> {
    return this.emit('MyPicasa:exifData', {
      'args': { entry } 
    });
  }
  async readPicasaEntry(entry: object):Promise<any> {
    return this.emit('MyPicasa:readPicasaEntry', {
      'args': { entry } 
    });
  }
  async updatePicasaEntry(entry: object, field: string, value: any):Promise<any> {
    return this.emit('MyPicasa:updatePicasaEntry', {
      'args': { entry, field, value } 
    });
  }
  async makeAlbum(name: string):Promise<any> {
    return this.emit('MyPicasa:makeAlbum', {
      'args': { name } 
    });
  }
  async openInFinder(album: object):Promise<any> {
    return this.emit('MyPicasa:openInFinder', {
      'args': { album } 
    });
  }
  async openEntryInFinder(entry: object):Promise<any> {
    return this.emit('MyPicasa:openEntryInFinder', {
      'args': { entry } 
    });
  }
  async undoList():Promise<any> {
    return this.emit('MyPicasa:undoList', {
      'args': {  } 
    });
  }
  async undo(id: string):Promise<any> {
    return this.emit('MyPicasa:undo', {
      'args': { id } 
    });
  }
  async imageInfo(entry: object):Promise<any> {
    return this.emit('MyPicasa:imageInfo', {
      'args': { entry } 
    });
  }
  async log(event: string, data: object):Promise<any> {
    return this.emit('MyPicasa:log', {
      'args': { event, data } 
    });
  }
  async exception(message: string, file: string, line: number, col: number, error: object):Promise<any> {
    return this.emit('MyPicasa:exception', {
      'args': { message, file, line, col, error } 
    });
  }
  async ready():Promise<any> {
    return this.emit('MyPicasa:ready', {
      'args': {  } 
    });
  }
  async getFilterList(group: string):Promise<any> {
    return this.emit('MyPicasa:getFilterList', {
      'args': { group } 
    });
  }
  async getFilterGroups():Promise<any> {
    return this.emit('MyPicasa:getFilterGroups', {
      'args': {  } 
    });
  }
  async setAlbumShortcut(album: object, shortcut: string):Promise<any> {
    return this.emit('MyPicasa:setAlbumShortcut', {
      'args': { album, shortcut } 
    });
  }
  async getShortcuts():Promise<any> {
    return this.emit('MyPicasa:getShortcuts', {
      'args': {  } 
    });
  }
  async getSourceEntry(entry: object):Promise<any> {
    return this.emit('MyPicasa:getSourceEntry', {
      'args': { entry } 
    });
  }
  async getFaceAlbumFromHash(hash: string):Promise<any> {
    return this.emit('MyPicasa:getFaceAlbumFromHash', {
      'args': { hash } 
    });
  }
  async rotate(entries: object, direction: string):Promise<any> {
    return this.emit('MyPicasa:rotate', {
      'args': { entries, direction } 
    });
  }
  async toggleStar(entries: object):Promise<any> {
    return this.emit('MyPicasa:toggleStar', {
      'args': { entries } 
    });
  }
  async getProjects(type: string):Promise<any> {
    return this.emit('MyPicasa:getProjects', {
      'args': { type } 
    });
  }
  async getProject(entry: object):Promise<any> {
    return this.emit('MyPicasa:getProject', {
      'args': { entry } 
    });
  }
  async writeProject(data: object, changeType: string):Promise<any> {
    return this.emit('MyPicasa:writeProject', {
      'args': { data, changeType } 
    });
  }
  async createProject(type: string, name: string):Promise<any> {
    return this.emit('MyPicasa:createProject', {
      'args': { type, name } 
    });
  }
  async buildMosaic(entry: object, width: number, height: number):Promise<any> {
    return this.emit('MyPicasa:buildMosaic', {
      'args': { entry, width, height } 
    });
  }
}