import axios from 'axios';

// Configuration
const API_BASE_URL = process.env.POST_DB_API_URL || 'http://localhost:5002';

// Types
interface PostMetadata {
  post_id: string;
  author_id: string;
  author_name?: string;
  content: string;
  created_at: string;
  content_type?: string;
  interaction_counts?: {
    favorites?: number;
    reblogs?: number;
    replies?: number;
    [key: string]: number | undefined;
  };
}

/**
 * Save post metadata to the database
 */
export async function savePostMetadata(post: PostMetadata): Promise<{ post_id: string }> {
  try {
    const response = await axios.post(`${API_BASE_URL}/posts`, post);
    return response.data;
  } catch (error) {
    console.error('Error saving post metadata:', error);
    throw error;
  }
}

/**
 * Get post metadata by post ID
 */
export async function getPostMetadata(postId: string): Promise<PostMetadata> {
  try {
    const response = await axios.get(`${API_BASE_URL}/posts/${postId}`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching post metadata for ${postId}:`, error);
    throw error;
  }
}

/**
 * Get posts by author ID
 */
export async function getPostsByAuthor(authorId: string): Promise<{ posts: PostMetadata[] }> {
  try {
    const response = await axios.get(`${API_BASE_URL}/posts/author/${authorId}`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching posts for author ${authorId}:`, error);
    throw error;
  }
}

/**
 * Get trending posts
 */
export async function getTrendingPosts(limit = 10): Promise<{ trending_posts: (PostMetadata & { total_interactions: number })[] }> {
  try {
    const response = await axios.get(`${API_BASE_URL}/posts/trending?limit=${limit}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching trending posts:', error);
    throw error;
  }
}

/**
 * Extract post metadata from Mastodon status object
 */
export function extractMetadataFromStatus(status: any): PostMetadata {
  return {
    post_id: status.id,
    author_id: status.account.id,
    author_name: status.account.username || status.account.displayName || status.account.display_name,
    content: status.content,
    created_at: status.created_at || status.createdAt,
    content_type: status.contentType || status.content_type || 'text',
    interaction_counts: {
      favorites: status.favourites_count || status.favouritesCount || 0,
      reblogs: status.reblogs_count || status.reblogsCount || 0,
      replies: status.replies_count || status.repliesCount || 0
    }
  };
}