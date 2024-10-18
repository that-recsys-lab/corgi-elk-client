<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
  alias: ['/signin/callback'],
})

const route = useRoute()
const router = useRouter()

// Redirect user if not authenticated
if (import.meta.client && route.path === '/signin/callback') {
  router.push('/home')
}

const { t } = useI18n()

// Update page title to reflect the personalized experience
useHydratedHead({
  title: () => t('nav.personalized'),
})
</script>

<template>
  <MainContent>
    <template #title>
      <NuxtLink to="/home" timeline-title-style flex items-center gap-2 @click="$scrollToTop">
        <div i-ri:home-5-line />
        <span>{{ $t('nav.personalized') }}</span>
      </NuxtLink>
    </template>

    <!-- Empty Personalized Page -->
    <div v-if="isHydrated" class="personalized-content">
      <!-- No content yet -->
    </div>
  </MainContent>
</template>

<style scoped>
.personalized-content {
    padding: 1rem;
    background-color: #f9f9f9;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

/* Add any future styles for the empty content area */
</style>
