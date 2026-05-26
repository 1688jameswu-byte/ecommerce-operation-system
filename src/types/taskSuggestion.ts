export type TaskSuggestionProblemType = 'traffic' | 'conversion' | 'deal' | 'opportunity';

export interface TaskSuggestionTemplate {
  id: string;
  name: string;
  problemType: TaskSuggestionProblemType;
  content: string;
  enabled: boolean;
  sortWeight: number;
  createdAt?: string;
  updatedAt?: string;
}
