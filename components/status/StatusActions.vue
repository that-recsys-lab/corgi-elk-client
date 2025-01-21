<script setup lang="ts">
import type { mastodon } from 'masto'

const props = defineProps<{
  status: mastodon.v1.Status & { more_like_this?: boolean }
  details?: boolean
  command?: boolean
}>()

const focusEditor = inject<typeof noop>('focus-editor', noop)

const { details, command } = props // TODO

const userSettings = useUserSettings()
const useStarFavoriteIcon = usePreferences('useStarFavoriteIcon')

const {
  status,
  isLoading,
  canReblog,
  toggleBookmark,
  toggleFavourite,
  toggleReblog,
  toggleMoreLikeThis,
  toggleLessLikeThis,
} = useStatusActions(props)

function reply() {
  if (!checkLogin())
    return
  if (details)
    focusEditor()
  else
    navigateToStatus({ status: status.value, focusReply: true })
}
</script>

<template>
  <div flex justify-between items-center class="status-actions">
    <div flex-1>
      <StatusActionButton
        :content="$t('action.reply')"
        :text="!getPreferences(userSettings, 'hideReplyCount') && status.repliesCount || ''"
        color="text-blue" hover="text-blue" elk-group-hover="bg-blue/10"
        icon="i-ri:chat-1-line"
        :command="command"
        @click="reply"
      >
        <template v-if="status.repliesCount && !getPreferences(userSettings, 'hideReplyCount')" #text>
          <CommonLocalizedNumber
            keypath="action.reply_count"
            :count="status.repliesCount"
          />
        </template>
      </StatusActionButton>
    </div>

    <div flex-1>
      <StatusActionButton
        :content="$t(status.reblogged ? 'action.boosted' : 'action.boost')"
        :text="!getPreferences(userSettings, 'hideBoostCount') && status.reblogsCount ? status.reblogsCount : ''"
        color="text-green" hover="text-green" elk-group-hover="bg-green/10"
        icon="i-ri:repeat-line"
        active-icon="i-ri:repeat-fill"
        inactive-icon="i-tabler:repeat-off"
        :active="!!status.reblogged"
        :disabled="isLoading.reblogged || !canReblog"
        :command="command"
        @click="toggleReblog()"
      >
        <template v-if="status.reblogsCount && !getPreferences(userSettings, 'hideBoostCount')" #text>
          <CommonLocalizedNumber
            keypath="action.boost_count"
            :count="status.reblogsCount"
          />
        </template>
      </StatusActionButton>
    </div>

    <div flex-1>
      <StatusActionButton
        :content="$t(status.favourited ? 'action.favourited' : 'action.favourite')"
        :text="!getPreferences(userSettings, 'hideFavoriteCount') && status.favouritesCount ? status.favouritesCount : ''"
        :color="useStarFavoriteIcon ? 'text-yellow' : 'text-rose'"
        :hover="useStarFavoriteIcon ? 'text-yellow' : 'text-rose'"
        :elk-group-hover="useStarFavoriteIcon ? 'bg-yellow/10' : 'bg-rose/10'"
        :icon="useStarFavoriteIcon ? 'i-ri:star-line' : 'i-ri:heart-3-line'"
        :active-icon="useStarFavoriteIcon ? 'i-ri:star-fill' : 'i-ri:heart-3-fill'"
        :active="!!status.favourited"
        :disabled="isLoading.favourited"
        :command="command"
        @click="toggleFavourite()"
      >
        <template v-if="status.favouritesCount && !getPreferences(userSettings, 'hideFavoriteCount')" #text>
          <CommonLocalizedNumber
            keypath="action.favourite_count"
            :count="status.favouritesCount"
          />
        </template>
      </StatusActionButton>
    </div>

    <div flex-1>
      <StatusActionButton
        :content="$t('action.more_like_this')"
        color="text-teal"
        hover="text-teal"
        elk-group-hover="bg-teal/10"
        icon="i-ri:thumb-up-line"
        :active-icon="status.more_like_this ? 'i-ri:thumb-up-fill' : 'i-ri:thumb-up-line'"
        :disabled="isLoading.moreLikeThis"
        :active="!!status.more_like_this"
        :command="command"
        @click="toggleMoreLikeThis()"
      >
        <template #text>
          <!-- Add custom text if needed for more like this -->
        </template>
      </StatusActionButton>
    </div>

    <div flex-1>
      <StatusActionButton
        :content="$t('action.less_like_this')"
        color="text-teal"
        hover="text-teal"
        elk-group-hover="bg-teal/10"
        icon="i-ri:thumb-down-line"
        :active-icon="status.less_like_this ? 'i-ri:thumb-down-fill' : 'i-ri:thumb-down-line'"
        :disabled="isLoading.lessLikeThis"
        :active="!!status.less_like_this"
        :command="command"
        @click="toggleLessLikeThis()"
      >
        <template #text>
          <!-- Add custom text if needed for less like this -->
        </template>
      </StatusActionButton>
    </div>

    <div flex-none>
      <StatusActionButton
        :content="$t(status.bookmarked ? 'action.bookmarked' : 'action.bookmark')"
        :color="useStarFavoriteIcon ? 'text-rose' : 'text-yellow'"
        :hover="useStarFavoriteIcon ? 'text-rose' : 'text-yellow'"
        :elk-group-hover="useStarFavoriteIcon ? 'bg-rose/10' : 'bg-yellow/10' "
        icon="i-ri:bookmark-line"
        active-icon="i-ri:bookmark-fill"
        :active="!!status.bookmarked"
        :disabled="isLoading.bookmarked"
        :command="command"
        @click="toggleBookmark()"
      />
    </div>
  </div>
</template>
