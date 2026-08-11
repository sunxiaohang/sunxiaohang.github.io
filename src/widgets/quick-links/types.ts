export interface QuickLink {
  id: string;
  name: string;
  url: string;
  icon?: string;
  createdAt: string;
}

export interface QuickLinksData {
  links: QuickLink[];
}
