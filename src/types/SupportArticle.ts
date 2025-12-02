export interface SupportArticleMeta {
  id: number;
  html_url: string;
  title: string;
  created_at?: string;
  edited_at?: string;
  section_id?: number;
}

export interface SupportArticle {
  id: number;
  url: string;
  htmlUrl: string;
  title: string;
  createdAt?: string;
  editedAt?: string;
  sectionId?: number;
  content: string;
}