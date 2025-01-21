import type { mastodon } from 'masto'
import logInteraction from './logger' // CORGI Logger

type Action = 'reblogged' | 'favourited' | 'bookmarked' | 'pinned' | 'muted'
type CountField = 'reblogsCount' | 'favouritesCount'

export interface StatusActionsProps {
  status: mastodon.v1.Status
  more_like_this?: boolean // Define the property for more like this CORGI feature
  less_like_this?: boolean // Define the property for less like this CORGI feature
}

export function useStatusActions(props: StatusActionsProps) {
  const status = ref<mastodon.v1.Status>({ ...props.status })
  const { client } = useMasto()
  const getUserId = () => currentUser.value?.account.id

  watch(
    () => props.status,
    val => status.value = { ...val },
    { deep: true, immediate: true },
  )

  // Use different states to let the user press different actions right after the other
  const isLoading = ref({
    reblogged: false,
    favourited: false,
    bookmarked: false,
    pinned: false,
    translation: false,
    muted: false,
    moreLikeThis: false, // new CORGI feature
    lessLikeThis: false, // new CORGI feature
  })

  // Temporary storage for CORGI non-native features
  const tempValues = {
    moreLikeThis: false,
    lessLikeThis: false,
  }

  async function toggleStatusAction(action: Action, fetchNewStatus: () => Promise<mastodon.v1.Status>, countField?: CountField) {
    // check login
    if (!checkLogin())
      return

    const prevCount = countField ? status.value[countField] : undefined

    isLoading.value[action] = true
    const isCancel = status.value[action]
    fetchNewStatus().then((newStatus) => {
      // when the action is cancelled, the count is not updated highly likely (if they're the same)
      // issue of Mastodon API
      if (isCancel && countField && prevCount === newStatus[countField])
        newStatus[countField] -= 1

      Object.assign(status, newStatus)
      cacheStatus(newStatus, undefined, true)
    }).finally(() => {
      isLoading.value[action] = false
    })
    // Optimistic update
    status.value[action] = !status.value[action]
    cacheStatus(status.value, undefined, true)
    if (countField)
      status.value[countField] += status.value[action] ? 1 : -1
  }

  const canReblog = computed(() =>
    status.value.visibility !== 'direct'
    && (status.value.visibility !== 'private' || status.value.account.id === currentUser.value?.account.id),
  )

  const toggleReblog = async () => {
    await toggleStatusAction(
      'reblogged',
      () => client.value.v1.statuses.$select(status.value.id)[status.value.reblogged ? 'unreblog' : 'reblog']().then((res) => {
        if (status.value.reblogged) {
          // returns the original status
          return res.reblog!
        }
        return res
      }),
      'reblogsCount',
    )

    const userId = getUserId() // Use the helper function
    logInteraction(userId, status.value.id, 'reblogged') // Log the interaction
  }

  const toggleFavourite = async () => {
    await toggleStatusAction(
      'favourited',
      () => client.value.v1.statuses.$select(status.value.id)[status.value.favourited ? 'unfavourite' : 'favourite'](),
      'favouritesCount',
    )

    const userId = getUserId() // Use the helper function
    logInteraction(userId, status.value.id, 'favourited') // Log the interaction
  }

  const toggleBookmark = async () => {
    await toggleStatusAction(
      'bookmarked',
      () => client.value.v1.statuses.$select(status.value.id)[status.value.bookmarked ? 'unbookmark' : 'bookmark'](),
    )

    const userId = getUserId() // Use the helper function
    logInteraction(userId, status.value.id, 'bookmarked') // Log the interaction
  }

  const togglePin = async () => {
    await toggleStatusAction(
      'pinned',
      () => client.value.v1.statuses.$select(status.value.id)[status.value.pinned ? 'unpin' : 'pin'](),
    )

    const userId = getUserId() // Use the helper function
    logInteraction(userId, status.value.id, 'pinned') // Log the interaction
  }

  const toggleMute = async () => {
    await toggleStatusAction(
      'muted',
      () => client.value.v1.statuses.$select(status.value.id)[status.value.muted ? 'unmute' : 'mute'](),
    )

    const userId = getUserId() // Use the helper function
    logInteraction(userId, status.value.id, 'muted') // Log the interaction
  }

  // CORGI features
  const toggleMoreLikeThis = async () => {
    tempValues.moreLikeThis = !tempValues.moreLikeThis // Toggle the temporary value
    status.value.more_like_this = tempValues.moreLikeThis // Update the status object
    const userId = getUserId() // Use the helper function
    logInteraction(userId, status.value.id, 'moreLikeThis')
  }

  const toggleLessLikeThis = async () => {
    tempValues.lessLikeThis = !tempValues.lessLikeThis // Toggle the temporary value
    status.value.less_like_this = tempValues.lessLikeThis // Update the status object
    const userId = getUserId() // Use the helper function
    logInteraction(userId, status.value.id, 'lessLikeThis')
  }

  return {
    status,
    isLoading,
    canReblog,
    toggleMute,
    toggleReblog,
    toggleFavourite,
    toggleBookmark,
    togglePin,
    toggleMoreLikeThis,
    toggleLessLikeThis,
  }
}
