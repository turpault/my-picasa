import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import { usePicisaService, useReconnectVersion } from "../AppContext";
import { events as serverEvents } from "../../../shared/server-events";
import { ProjectType, type Project } from "../../../shared/types/types";

type ProjectsMap = Partial<Record<ProjectType, Project[]>>;

const ProjectsCacheContext = createContext<ProjectsMap>({});

export function ProjectsCacheProvider({ children }: { children: ReactNode }) {
  const service = usePicisaService();
  const reconnectVersion = useReconnectVersion();
  const [projects, setProjects] = useState<ProjectsMap>({});
  const fetchIdRef = useRef(0);

  const fetchProjects = useCallback(async () => {
    if (!service) return;
    const id = ++fetchIdRef.current;
    const types = Object.values(ProjectType);
    const results = await Promise.all(
      types.map(
        async (type) =>
          [type, await service.getProjects(type)] as const,
      ),
    );
    if (id === fetchIdRef.current) {
      const map: ProjectsMap = {};
      for (const [type, list] of results) {
        map[type] = list;
      }
      setProjects(map);
    }
  }, [service]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects, reconnectVersion]);

  useEffect(() => {
    const off = serverEvents.on("projectsUpdated", fetchProjects);
    return off;
  }, [fetchProjects]);

  return (
    <ProjectsCacheContext.Provider value={projects}>
      {children}
    </ProjectsCacheContext.Provider>
  );
}

export function useProjects(type: ProjectType): Project[] {
  const projects = useContext(ProjectsCacheContext);
  return projects[type] ?? [];
}
