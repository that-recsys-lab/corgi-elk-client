<script setup lang="ts">
import axios from 'axios'
import { ref } from 'vue'

// Variable to store interaction counts
interface Interaction {
  action_type: string
  count: number
}

const interactionCounts = ref<Interaction[]>([])

// Function to fetch interaction counts from backend
async function fetchInteractionCounts(postId) {
  try {
    const response = await trackAndFetch(
      () => axios.get(`http://localhost:5001/interactions/${postId}`),
      {
        user_id: 1, // Replace with actual user ID
        action_type: 'favorite',
        post_id: postId,
      },
    )
    interactionCounts.value = response.interactions
  }
  catch (error) {
    console.error('Error fetching interactions:', error)
  }
}

// (Commented out for now, so it won't break the build)
// import { useMastoClient } from '~/composables/masto/masto'
// const paginator = async (...args) => {
//   const result = await trackAndFetch(
//     () => useMastoClient().v1.favourites.list(...args), // Original API method
//     {
//       user_id: currentUser?.id || 1, // Replace with the actual user ID from Elk
//       action_type: 'favourite',
//       post_id: null, // Replace with dynamic post ID when available
//     }
//   )
//   return result
// }

// Function to wrap Mastodon API calls and log interactions
async function trackAndFetch(apiMethod, logData) {
  const result = await apiMethod() // Execute Mastodon API call
  try {
    await axios.post('http://localhost:5001/interactions', logData) // Log interaction
  }
  catch (error) {
    console.error('Error logging interaction:', error)
  }
  return result
}

// Example: Fetch interaction counts for a specific post
fetchInteractionCounts('post123')
</script>

<template>
  <div v-if="interactionCounts.length">
    <p v-for="interaction in interactionCounts" :key="interaction.action_type">
      {{ interaction.action_type }}: {{ interaction.count }}
    </p>
  </div>
</template>
