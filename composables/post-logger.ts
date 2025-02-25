import type { mastodon } from 'masto'
import axios from 'axios'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { currentUser, updateUserPreferences } from './users'

// Configuration
const API_BASE_URL = process.env.POST_DB_API_URL || 'http://localhost:5002'

// Types
interface PostMetadata {
  post_id: string
  author_id: string
  content: string
  created_at: string
  interaction_counts?: Record<string, number>
}

// Save post metadata to database
async function savePostMetadata(post: PostMetadata): Promise<{ post_id: string }> {
  try {
    const response = await axios.post(`${API_BASE_URL}/posts`, post)
    return response.data
  } catch (error) {
    console.error('Error saving post metadata:', error)
    throw error
  }
}

// Extract post metadata from Mastodon status
function extractMetadataFromStatus(status: mastodon.v1.Status): PostMetadata {
  return {
    post_id: status.id,
    author_id: status.account.id,
    content: status.content,
    created_at: status.createdAt,
    interaction_counts: {
      favorites: status.favouritesCount,
      reblogs: status.reblogsCount,
      replies: status.repliesCount
    }
  }
}

// Reactive state to track what posts we've already logged
const loggedPosts = ref(new Set<string>())

// User preference for consent
export function usePostLoggingConsent() {
  const consentToPostLogging = computed({
    get: () => currentUser.value?.preferences?.consentToPostLogging || false,
    set: (value) => {
      updateUserPreferences({ consentToPostLogging: value })
    }
  })
  
  return { consentToPostLogging }
}

// Function to log timeline posts
export async function logTimelinePosts(posts: mastodon.v1.Status[]) {
  // Check for user consent
  if (!currentUser.value?.preferences?.consentToPostLogging)
    return
    
  // Process each post
  for (const status of posts) {
    // Skip if already logged
    if (loggedPosts.value.has(status.id))
      continue
      
    // Extract metadata
    const metadata = extractMetadataFromStatus(status)
    
    try {
      // Save to database
      await savePostMetadata(metadata)
      // Mark as logged
      loggedPosts.value.add(status.id)
    }
    catch (error) {
      console.error('Failed to log post:', error)
    }
  }
}

// Register an observer to monitor timeline changes
export function useTimelineLogger() {
  // Only proceed if user has given consent
  if (!currentUser.value?.preferences?.consentToPostLogging)
    return
    
  onMounted(() => {
    // Set up a mutation observer to detect when new posts are rendered
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length) {
          // Find status cards that were added
          const statusElements = document.querySelectorAll('article.status:not([data-logged="true"])')
          if (statusElements.length) {
            // Mark them as logged
            statusElements.forEach(el => {
              const statusId = el.getAttribute('data-status-id')
              if (statusId) {
                el.setAttribute('data-logged', 'true')
                // We don't have the full status object here, so we'll need to extract what we can
                const authorElement = el.querySelector('.status-author')
                const contentElement = el.querySelector('.status-content')
                const authorId = authorElement?.getAttribute('data-author-id')
                
                if (authorId && statusId) {
                  savePostMetadata({
                    post_id: statusId,
                    author_id: authorId,
                    content: contentElement?.innerHTML || '',
                    created_at: new Date().toISOString()
                  }).catch(console.error)
                }
              }
            })
          }
        }
      }
    })
    
    // Start observing timeline containers
    const timelineContainer = document.querySelector('.timeline-container')
    if (timelineContainer) {
      observer.observe(timelineContainer, { childList: true, subtree: true })
    }
    
    // Clean up on unmount
    onUnmounted(() => {
      observer.disconnect()
    })
  })
}