import { buildEmitter, Emitter } from "../../../shared/lib/event";
import { Project, ProjectType } from "../../../shared/types/types";
import { getService } from "../../rpc/connect";
import { events as serverEvents } from "../../../shared/server-events";

export type ProjectCacheEvent = {
  projectsChanged: { type: ProjectType; projects: Project[] };
  projectAdded: { project: Project };
  projectRemoved: { project: Project };
};

export class ProjectCache {
  private projects: { [type: string]: Project[] } = {
    [ProjectType.MOSAIC]: [],
    [ProjectType.SLIDESHOW]: [],
  };
  public readonly emitter: Emitter<ProjectCacheEvent>;

  constructor() {
    this.emitter = buildEmitter<ProjectCacheEvent>();
  }

  async init() {
    await Promise.all([
      this.refresh(ProjectType.MOSAIC),
      this.refresh(ProjectType.SLIDESHOW),
    ]);
    this.setupEventListeners();
  }

  private setupEventListeners() {
    serverEvents.on("projectsUpdated", async () => {
      // Refresh all project types
      await Promise.all([
        this.refresh(ProjectType.MOSAIC),
        this.refresh(ProjectType.SLIDESHOW),
      ]);
    });
  }

  async refresh(type: ProjectType) {
    const s = await getService();
    const projects = await s.getProjects(type);
    const oldProjects = this.projects[type] || [];
    this.projects[type] = projects;
    
    // Emit individual events for added/removed projects
    const oldMap = new Map(oldProjects.map((p: Project) => [p.name, p]));
    const newMap = new Map(projects.map((p: Project) => [p.name, p]));
    
    for (const project of projects) {
      if (!oldMap.has(project.name)) {
        this.emitter.emit("projectAdded", { project });
      }
    }
    
    for (const project of oldProjects) {
      if (!newMap.has(project.name)) {
        this.emitter.emit("projectRemoved", { project });
      }
    }
    
    this.emitter.emit("projectsChanged", { type, projects });
  }

  getProjects(type: ProjectType): Project[] {
    return [...(this.projects[type] || [])];
  }

  getProjectsCount(type: ProjectType): number {
    return this.projects[type]?.length || 0;
  }
}

let cacheInstance: ProjectCache | undefined;

export function getProjectCache(): ProjectCache {
  if (!cacheInstance) {
    cacheInstance = new ProjectCache();
  }
  return cacheInstance;
}
