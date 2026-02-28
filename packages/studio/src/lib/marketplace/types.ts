/**
 * Marketplace types for community templates
 */

export interface MarketplaceTemplate {
  id: string;
  name: string;
  description: string;
  author: {
    id: string;
    name: string;
    avatar?: string;
  };
  type: 'workflow' | 'behavior_tree';
  tags: string[];
  category: string;
  rating: number;
  downloadCount: number;
  createdAt: number;
  updatedAt: number;
  thumbnailUrl?: string;
  previewUrl?: string;
  featured?: boolean;
}

export interface MarketplaceCategory {
  id: string;
  name: string;
  description: string;
  templateCount: number;
}

export interface MarketplaceFilter {
  category?: string;
  tags?: string[];
  type?: 'workflow' | 'behavior_tree';
  minRating?: number;
  search?: string;
  sortBy?: 'popular' | 'recent' | 'rating' | 'downloads';
  page?: number;
  limit?: number;
}

export interface MarketplaceResponse<T> {
  data: T;
  total: number;
  page: number;
  limit: number;
}

export interface TemplateUpload {
  name: string;
  description: string;
  type: 'workflow' | 'behavior_tree';
  tags: string[];
  category: string;
  content: string; // JSON stringified template
  thumbnail?: File;
}

export interface TemplateReview {
  id: string;
  templateId: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt: number;
}
