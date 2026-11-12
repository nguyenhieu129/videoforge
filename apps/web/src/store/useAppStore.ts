import { create } from 'zustand';

export type NavTab =
  | 'dashboard'
  | 'create'
  | 'pipeline'
  | 'voice_studio'
  | 'library'
  | 'publish_queue'
  | 'settings';

interface VideoForgeStore {
  activeTab: NavTab;
  theme: 'dark' | 'light';
  activeRunId: string | null;
  selectedStepIndex: number;
  setActiveTab: (tab: NavTab) => void;
  toggleTheme: () => void;
  openPipelineRun: (runId: string, stepIndex?: number) => void;
  setSelectedStepIndex: (stepIndex: number) => void;
}

export const useAppStore = create<VideoForgeStore>((set) => ({
  activeTab: 'dashboard',
  theme: 'dark',
  activeRunId: null,
  selectedStepIndex: 1,
  setActiveTab: (activeTab) => set({ activeTab }),
  toggleTheme: () =>
    set((s) => ({
      theme: s.theme === 'dark' ? 'light' : 'dark',
    })),
  openPipelineRun: (runId, stepIndex = 1) =>
    set({
      activeRunId: runId,
      selectedStepIndex: stepIndex,
      activeTab: 'pipeline',
    }),
  setSelectedStepIndex: (selectedStepIndex) => set({ selectedStepIndex }),
}));
