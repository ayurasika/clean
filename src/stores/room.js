import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export const useRoomStore = defineStore('room', () => {
  // 汚部屋レベル（0-100、高いほど汚い）
  const dirtyLevel = ref(85)

  // 分析結果テキスト
  const analysisResult = ref('')

  // 選択されたエリア（ゾーン）
  const selectedZone = ref('')

  // エリア選定理由（AIからのアドバイス）
  const zoneReason = ref('')

  // 推定所要時間
  const estimatedTime = ref('')

  // 認識された全エリア
  const allZones = ref([])

  // 未来予想図のURL
  const futureVisionUrl = ref('')

  // 現在のミッション（選択されたエリアの最初のタスク）
  const currentMission = ref({
    icon: '👑',
    text: '部屋を撮影して分析を始めましょう',
  })

  // 次の予定リスト（選択されたエリアの残りのタスク）
  const nextTasks = ref([])

  // 汚部屋レベルに応じたメッセージ
  const dirtyLevelMessage = computed(() => {
    const level = dirtyLevel.value
    if (level >= 90) return '危険レベル！今すぐ片付けよう'
    if (level >= 70) return 'あと少しで人が呼べる!'
    if (level >= 50) return '半分まで来た！その調子'
    if (level >= 30) return 'かなりキレイ！'
    if (level >= 10) return 'ほぼ完璧！'
    return '完璧な部屋！'
  })

  // 分析が完了しているかどうか
  const hasAnalysis = computed(() => {
    return selectedZone.value !== '' && currentMission.value.text !== '部屋を撮影して分析を始めましょう'
  })

  // 汚部屋レベルを更新
  function setDirtyLevel(level) {
    dirtyLevel.value = Math.max(0, Math.min(100, level))
  }

  // 分析結果を保存
  function setAnalysisResult(result) {
    analysisResult.value = result
  }

  // 未来予想図URLを保存
  function setFutureVisionUrl(url) {
    futureVisionUrl.value = url
  }

  // ミッションを更新
  function setCurrentMission(mission) {
    currentMission.value = mission
  }

  // タスクリストを更新
  function setNextTasks(tasks) {
    nextTasks.value = tasks
  }

  // 戦略的分析結果から全データを更新
  function updateFromStrategicAnalysis(data) {
    const {
      analysis,
      dirtyLevel: level,
      selectedZone: zone,
      reason,
      tasks,
      estimatedTime: time,
      zones,
    } = data

    // 基本データを更新
    setDirtyLevel(level)
    setAnalysisResult(analysis)
    selectedZone.value = zone || ''
    zoneReason.value = reason || ''
    estimatedTime.value = time || ''
    allZones.value = zones || []

    // タスクを更新
    if (tasks && tasks.length > 0) {
      // 最初のタスクを現在のミッションに
      setCurrentMission({
        icon: '👑',
        text: tasks[0],
      })

      // 残りを次の予定リストに
      const icons = ['📚', '👕', '🗑️', '📦', '🧹']
      setNextTasks(
        tasks.slice(1).map((task, index) => ({
          icon: icons[index] || '📌',
          text: task,
          completed: false,
        })),
      )
    }
  }

  // ミッション完了時の処理
  function completeMission() {
    // レベルを少し下げる
    setDirtyLevel(dirtyLevel.value - 5)

    // 次のタスクがあれば昇格
    if (nextTasks.value.length > 0) {
      const nextTask = nextTasks.value[0]
      setCurrentMission({
        icon: '👑',
        text: nextTask.text,
      })
      setNextTasks(nextTasks.value.slice(1))
    } else {
      // 全タスク完了
      setCurrentMission({
        icon: '🎉',
        text: 'このエリアの片付け完了！',
      })
    }
  }

  // ストアをリセット
  function reset() {
    dirtyLevel.value = 85
    analysisResult.value = ''
    selectedZone.value = ''
    zoneReason.value = ''
    estimatedTime.value = ''
    allZones.value = []
    futureVisionUrl.value = ''
    currentMission.value = {
      icon: '👑',
      text: '部屋を撮影して分析を始めましょう',
    }
    nextTasks.value = []
  }

  return {
    // 状態
    dirtyLevel,
    dirtyLevelMessage,
    analysisResult,
    selectedZone,
    zoneReason,
    estimatedTime,
    allZones,
    futureVisionUrl,
    currentMission,
    nextTasks,
    hasAnalysis,
    // アクション
    setDirtyLevel,
    setAnalysisResult,
    setFutureVisionUrl,
    setCurrentMission,
    setNextTasks,
    updateFromStrategicAnalysis,
    completeMission,
    reset,
  }
})
