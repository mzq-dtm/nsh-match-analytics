import { useRouter } from 'vue-router'

export function useOpenHistoryRoute() {
  const router = useRouter()

  function openHistory(playerId: string | number | null | undefined) {
    if (playerId == null || playerId === '') return

    router.push({
      name: 'player-history',
      query: { playerId: String(playerId) },
    })
  }

  return { openHistory }
}
