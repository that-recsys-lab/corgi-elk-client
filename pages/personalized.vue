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

    <!-- This shows the home timeline -->
    <!-- <TimelineHome v-if="isHydrated" /> -->

    <!-- This shows the personalized timeline -->
    <TimelinePersonalized v-if="isHydrated" />
  </MainContent>
</template>
