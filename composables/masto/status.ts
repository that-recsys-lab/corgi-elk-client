import type { mastodon } from 'masto'
import { logger } from './logger'

type Action = 'reblogged' | 'favourited' | 'bookmarked' | 'pinned' | 'muted'
type CountField = 'reblogsCount' | 'favouritesCount'

export interface StatusActionsProps {
  status: mastodon.v1.Status
  more_like_this?: boolean // CORGI feature
  less_like_this?: boolean // CORGI feature
}

export function useStatusActions(props: StatusActionsProps) {
  const status = ref<mastodon.v1.Status>({ ...props.status })
  const { client } = useMasto()
  const getUserId = () => currentUser.value?.account.id

  watch(
    () => props.status,
    val => (status.value = { ...val }),
    { deep: true, immediate: true },
  )

  const isLoading = ref({
    reblogged: false,
    favourited: false,
    bookmarked: false,
    pinned: false,
    muted: false,
    moreLikeThis: false, // CORGI feature
    lessLikeThis: false, // CORGI feature
  })

  const canReblog = computed(() => {
    return checkLogin() && !status.value.reblogged && !isLoading.value.reblogged
  })

  async function _toggleStatusAction(
    action: Action,
    fetchNewStatus: () => Promise<mastodon.v1.Status>,
    countField?: CountField,
  ) {
    if (!checkLogin())
      return

    const prevCount = countField ? status.value[countField] : undefined

    isLoading.value[action] = true
    const isCancel = status.value[action]
    fetchNewStatus()
      .then((newStatus) => {
        if (isCancel && countField && prevCount === newStatus[countField])
          newStatus[countField] -= 1

        Object.assign(status.value, newStatus)
        cacheStatus(newStatus, undefined, true)
      })
      .finally(() => {
        isLoading.value[action] = false
      })

    status.value[action] = !status.value[action]
    if (countField)
      status.value[countField] += status.value[action] ? 1 : -1
  }

  async function logAndToggle(
    action: Action,
    toggleAPI: () => Promise<mastodon.v1.Status>,
    countField?: CountField,
  ) {
    try {
      const userId = getUserId()
      const logData = {
        user_id: userId,
        post_id: status.value.id,
        action_type: action,
      }

      logger.debug(`📦 Logging ${action} to Flask:`, logData)

      // Log to Flask
      await fetch('http://localhost:5001/interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logData),
      })

      // Call Mastodon API & Wait for Response
      const newStatus = await toggleAPI()

      // Ensure the UI Reflects the Correct API Response
      if (countField) {
        const prevCount = status.value[countField]
        if (status.value[action] && prevCount === newStatus[countField])
          newStatus[countField] -= 1
      }

      Object.assign(status.value, newStatus)
      cacheStatus(newStatus, undefined, true)

      logger.debug(`✅ Successfully toggled ${action} on Mastodon`)
    }
    catch (error) {
      console.error(`❌ Error in ${action}:`, error)
    }
    finally {
      isLoading.value[action] = false
    }
  }

  const toggleReblog = async () =>
    logAndToggle(
      'reblogged',
      () =>
        client.value.v1.statuses.$select(status.value.id)[status.value.reblogged ? 'unreblog' : 'reblog'](),
      'reblogsCount',
    )

  const toggleFavourite = async () =>
    logAndToggle(
      'favourited',
      () =>
        client.value.v1.statuses.$select(status.value.id)[status.value.favourited ? 'unfavourite' : 'favourite'](),
      'favouritesCount',
    )

  const toggleBookmark = async () =>
    logAndToggle(
      'bookmarked',
      () =>
        client.value.v1.statuses.$select(status.value.id)[status.value.bookmarked ? 'unbookmark' : 'bookmark'](),
    )

  const togglePin = async () =>
    logAndToggle(
      'pinned',
      () =>
        client.value.v1.statuses.$select(status.value.id)[status.value.pinned ? 'unpin' : 'pin'](),
    )

  const toggleMute = async () =>
    logAndToggle(
      'muted',
      () =>
        client.value.v1.statuses.$select(status.value.id)[status.value.muted ? 'unmute' : 'mute'](),
    )

  const toggleMoreLikeThis = async () => {
    try {
      const userId = getUserId()
      const logData = {
        user_id: userId,
        post_id: status.value.id,
        action_type: 'more_like_this',
        context: { some_metadata: 'example' }, // Add metadata if needed
      }

      logger.debug('📦 Logging more_like_this to Flask:', logData)

      // Log to Flask
      await fetch('http://localhost:5001/interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logData),
      })

      // Update local state
      status.value.more_like_this = !status.value.more_like_this
    }
    catch (error) {
      logger.error('❌ Error in toggleMoreLikeThis:', error)
    }
  }

  const toggleLessLikeThis = async () => {
    try {
      const userId = getUserId()
      const logData = {
        user_id: userId,
        post_id: status.value.id,
        action_type: 'less_like_this',
        context: { some_metadata: 'example' }, // Add metadata if needed
      }

      logger.debug('📦 Logging less_like_this to Flask:', logData)

      // Log to Flask
      await fetch('http://localhost:5001/interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logData),
      })

      // Update local state
      status.value.less_like_this = !status.value.less_like_this
    }
    catch (error) {
      logger.error('❌ Error in toggleLessLikeThis:', error)
    }
  }

  return {
    status,
    isLoading,
    canReblog,
    toggleReblog,
    toggleFavourite,
    toggleBookmark,
    togglePin,
    toggleMute,
    toggleMoreLikeThis,
    toggleLessLikeThis,
  }
}
