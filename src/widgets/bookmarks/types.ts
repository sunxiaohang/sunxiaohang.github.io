export interface Bookmark {
  id: string;
  title: string;
  url: string;
  category: string;
  icon?: string;
  createdAt: string;
}

export interface BookmarksData {
  bookmarks: Bookmark[];
  categories: string[];
}
