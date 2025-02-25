<script setup lang="ts">
// Temporary placeholder until we fix the type errors
const consentToPostLogging = ref(false)
</script>

<template>
  <div class="settings-group">
    <h3 class="setting-section-title">
      {{ $t('settings.data_collection') }}
    </h3>
    <div class="setting-item">
      <CommonToggle
        v-model="consentToPostLogging"
        :label="$t('settings.enable_post_logging')"
        class="w-full"
      >
        <template #description>
          <p class="text-secondary" pt-1>
            {{ $t('settings.post_logging_description') }}
          </p>
        </template>
      </CommonToggle>
    </div>
  </div>
</template>