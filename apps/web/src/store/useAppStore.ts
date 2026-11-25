import { create } from 'zustand';

export type WorkspaceSection = 'studio' | 'voices_assets' | 'settings';
export type StudioCenterTab = 'script' | 'storyboard' | 'pipeline' | 'publish';

// Giữ tương thích với các component phụ nếu cần
export type NavTab = WorkspaceSection;

interface VideoForgeStore {
  activeSection: WorkspaceSection;
  studioTab: StudioCenterTab;
  sidebarCollapsed: boolean;
  createModalOpen: boolean;
  selectedProjectId: string | null;
  activeRunId: string | null;
  selectedStepIndex: number;
  setActiveSection: (section: WorkspaceSection) => void;
  setStudioTab: (tab: StudioCenterTab) => void;
  toggleSidebar: () => void;
  setCreateModalOpen: (open: boolean) => void;
  selectProjectAndRun: (projectId: string | null, runId: string | null, tab?: StudioCenterTab) => void;
  openPipelineRun: (runId: string, stepIndex?: number, projectId?: string) => void;
  setSelectedStepIndex: (stepIndex: number) => void;
}

export const useAppStore = create<VideoForgeStore>((set) => ({
  activeSection: 'studio',
  studioTab: 'pipeline',
  sidebarCollapsed: false,
  createModalOpen: false,
  selectedProjectId: null,
  activeRunId: null,
  selectedStepIndex: 1,
  setActiveSection: (activeSection) => set({ activeSection }),
  setStudioTab: (studioTab) => set({ studioTab }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setCreateModalOpen: (createModalOpen) => set({ createModalOpen }),
  selectProjectAndRun: (selectedProjectId, activeRunId, tab) =>
    set((s) => ({
      selectedProjectId,
      activeRunId,
      activeSection: 'studio',
      studioTab: tab ?? s.studioTab,
    })),
  openPipelineRun: (runId, stepIndex = 1, projectId) =>
    set((s) => ({
      activeRunId: runId,
      selectedStepIndex: stepIndex,
      selectedProjectId: projectId ?? s.selectedProjectId,
      activeSection: 'studio',
      studioTab: 'pipeline',
    })),
  setSelectedStepIndex: (selectedStepIndex) => set({ selectedStepIndex }),
}));
