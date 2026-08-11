export type Priority = 'low' | 'medium' | 'high';

export interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  priority: Priority;
  dueDate?: string;
  createdAt: string;
}

export interface TodoData {
  tasks: TodoItem[];
}
