export interface IdeaNote {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface IdeasData {
  notes: IdeaNote[];
  tags: string[];
}
