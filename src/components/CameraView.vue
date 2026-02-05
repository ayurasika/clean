<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { analyzeImageWithClaude } from '../utils/claude.js'
import { generateFutureVision, analyzeCleanupSpots, getUsageStatus } from '../utils/gemini.js'
import { useRoomStore } from '../stores/room.js'

const router = useRouter()
const roomStore = useRoomStore()

const videoRef = ref(null)
const canvasRef = ref(null)
const fileInputRef = ref(null)
const stream = ref(null)
const capturedImage = ref(null)

// フェーズ管理
// 'camera' | 'generating' | 'vision' | 'analyzing_spots' | 'spots_result' | 'analyzing' | 'complete'
const currentPhase = ref('camera')
const futureVisionUrl = ref(null)
const analysisResult = ref(null)

// 片付け場所の分析結果
const cleanupSpots = ref([])
const totalEstimatedTime = ref('')
const encouragement = ref('')
const completedSpots = ref([])

// 高画質モード設定
const highQualityMode = ref(false)
const usageStatus = ref({ flash: { used: 0, limit: 50 }, pro: { used: 0, limit: 10 } })

// Before/After比較スライダー
const sliderPosition = ref(50) // 0-100（50が中央）
const isDragging = ref(false)
const sliderContainerRef = ref(null)

// スライダードラッグ開始
const startDrag = (e) => {
  isDragging.value = true
  updateSliderPosition(e)
}

// スライダードラッグ中
const onDrag = (e) => {
  if (!isDragging.value) return
  updateSliderPosition(e)
}

// スライダードラッグ終了
const endDrag = () => {
  isDragging.value = false
}

// スライダー位置を更新
const updateSliderPosition = (e) => {
  if (!sliderContainerRef.value) return

  const container = sliderContainerRef.value
  const rect = container.getBoundingClientRect()

  // タッチイベントとマウスイベントの両方に対応
  const clientX = e.touches ? e.touches[0].clientX : e.clientX

  // コンテナ内の相対位置を計算
  const x = clientX - rect.left
  const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100))

  sliderPosition.value = percentage
}

// カメラの開始
const startCamera = async () => {
  try {
    const mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }
    })
    stream.value = mediaStream
    if (videoRef.value) {
      videoRef.value.srcObject = mediaStream
    }
  } catch (error) {
    console.error('カメラの起動に失敗しました:', error)
    alert('カメラへのアクセスが許可されていません')
  }
}

// 写真を撮影
const capturePhoto = () => {
  if (!videoRef.value || !canvasRef.value) return

  const video = videoRef.value
  const canvas = canvasRef.value
  const context = canvas.getContext('2d')

  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  context.drawImage(video, 0, 0)

  capturedImage.value = canvas.toDataURL('image/jpeg')
  stopCamera()

  // STEP 1: 未来予想図を生成
  generateFutureImage()
}

// ファイル選択ダイアログを開く
const openFileSelector = () => {
  if (fileInputRef.value) {
    fileInputRef.value.click()
  }
}

// ファイルが選択された時の処理
const handleFileSelect = (event) => {
  const file = event.target.files[0]
  if (!file) return

  // 画像ファイルかチェック
  if (!file.type.startsWith('image/')) {
    alert('画像ファイルを選択してください')
    return
  }

  // FileReaderでBase64に変換
  const reader = new FileReader()
  reader.onload = (e) => {
    capturedImage.value = e.target.result
    stopCamera()

    console.log('ファイルから画像を読み込みました:', file.name)

    // STEP 1: 未来予想図を生成（カメラ撮影と同じ処理）
    generateFutureImage()
  }
  reader.onerror = () => {
    alert('ファイルの読み込みに失敗しました')
  }
  reader.readAsDataURL(file)

  // input をリセット（同じファイルを再選択できるように）
  event.target.value = ''
}

// カメラを停止
const stopCamera = () => {
  if (stream.value) {
    stream.value.getTracks().forEach(track => track.stop())
    stream.value = null
  }
}

// 使用状況を取得
const fetchUsageStatus = async () => {
  const result = await getUsageStatus()
  if (result.success) {
    usageStatus.value = result.usage
  }
}

// STEP 1: 未来予想図を生成（Gemini Image-to-Image）
const generateFutureImage = async () => {
  currentPhase.value = 'generating'

  try {
    // Gemini に撮影した画像を渡して、片付いた状態に変換
    // 高画質モードが有効な場合はProモデルを使用
    const result = await generateFutureVision(capturedImage.value, false, highQualityMode.value)

    if (result.success) {
      futureVisionUrl.value = result.imageUrl
      roomStore.setFutureVisionUrl(result.imageUrl)
      currentPhase.value = 'vision'
      // 使用状況を更新
      if (result.usage) {
        usageStatus.value = result.usage
      }
      console.log('未来予想図を生成しました（モデル:', result.model, '）')
    } else {
      console.error('未来予想図の生成に失敗:', result.error)
      alert('未来予想図の生成に失敗しました。再度お試しください。')
      resetToCamera()
    }
  } catch (error) {
    console.error('未来予想図生成エラー:', error)
    alert('エラーが発生しました。再度お試しください。')
    resetToCamera()
  }
}

// 再生成: もっと綺麗な未来予想図を生成（より強力なプロンプト使用）
const regenerateFutureImage = async () => {
  if (!capturedImage.value) return

  currentPhase.value = 'generating'

  try {
    // isRegenerate = true で より強力なプロンプトを使用
    // 高画質モードが有効な場合はProモデルを使用
    const result = await generateFutureVision(capturedImage.value, true, highQualityMode.value)

    if (result.success) {
      futureVisionUrl.value = result.imageUrl
      roomStore.setFutureVisionUrl(result.imageUrl)
      currentPhase.value = 'vision'
      // 使用状況を更新
      if (result.usage) {
        usageStatus.value = result.usage
      }
      console.log('未来予想図を再生成しました（モデル:', result.model, '）')
    } else {
      console.error('再生成に失敗:', result.error)
      alert('再生成に失敗しました。もう一度お試しください。')
      currentPhase.value = 'vision'
    }
  } catch (error) {
    console.error('再生成エラー:', error)
    alert('エラーが発生しました。')
    currentPhase.value = 'vision'
  }
}

// STEP 2: 片付け場所を分析（Gemini）
const analyzeSpots = async () => {
  if (!capturedImage.value) return

  currentPhase.value = 'analyzing_spots'

  try {
    const result = await analyzeCleanupSpots(capturedImage.value)

    if (result.success && result.spots && result.spots.length > 0) {
      cleanupSpots.value = result.spots
      totalEstimatedTime.value = result.totalEstimatedTime
      encouragement.value = result.encouragement
      completedSpots.value = []
      currentPhase.value = 'spots_result'
      console.log('片付け場所分析完了:', result.spots)
    } else {
      console.error('片付け場所の分析に失敗:', result.error || 'spots が空です')
      // フォールバック: 従来の戦略的分析へ
      startStrategicAnalysis()
    }
  } catch (error) {
    console.error('片付け場所分析エラー:', error)
    // フォールバック: 従来の戦略的分析へ
    startStrategicAnalysis()
  }
}

// スポットの完了/未完了を切り替え
const toggleSpotComplete = (index) => {
  if (completedSpots.value.includes(index)) {
    completedSpots.value = completedSpots.value.filter(i => i !== index)
  } else {
    completedSpots.value.push(index)
  }
}

// 優先度に応じた色を返す
const getPriorityColor = (priority) => {
  switch (priority) {
    case 'high': return 'bg-red-500'
    case 'medium': return 'bg-yellow-500'
    case 'low': return 'bg-green-500'
    default: return 'bg-gray-500'
  }
}

// 優先度の日本語表示
const getPriorityLabel = (priority) => {
  switch (priority) {
    case 'high': return '優先'
    case 'medium': return '普通'
    case 'low': return '余裕'
    default: return ''
  }
}

// STEP 3: 戦略的分析を開始（Claude）
const startStrategicAnalysis = async () => {
  if (!capturedImage.value) return

  currentPhase.value = 'analyzing'

  try {
    const claudeResult = await analyzeImageWithClaude(capturedImage.value)

    if (claudeResult.success) {
      analysisResult.value = claudeResult.analysis
      console.log('戦略的分析結果:', claudeResult.analysis)

      const jsonData = extractJsonFromAnalysis(claudeResult.analysis)
      console.log('抽出されたJSONデータ:', jsonData)

      if (jsonData) {
        roomStore.updateFromStrategicAnalysis({
          analysis: claudeResult.analysis,
          dirtyLevel: jsonData.dirtyLevel,
          selectedZone: jsonData.selectedZone,
          reason: jsonData.reason,
          tasks: jsonData.tasks,
          estimatedTime: jsonData.estimatedTime,
          zones: jsonData.zones,
        })
      } else {
        console.warn('JSONデータが抽出できませんでした')
        roomStore.setAnalysisResult(claudeResult.analysis)
      }

      currentPhase.value = 'complete'

      // 2秒後にホームへ遷移
      setTimeout(() => {
        goHome()
      }, 2000)
    } else {
      console.error('戦略的分析エラー:', claudeResult.error)
      alert('分析に失敗しました: ' + claudeResult.error)
      currentPhase.value = 'spots_result'
    }
  } catch (error) {
    console.error('分析エラー:', error)
    alert('分析中にエラーが発生しました')
    currentPhase.value = 'spots_result'
  }
}

// 分析結果からJSONデータを抽出
const extractJsonFromAnalysis = (text) => {
  try {
    // 複数行にわたるJSONを抽出
    const jsonMatch = text.match(/\{[\s\S]*?"dirtyLevel"[\s\S]*?"selectedZone"[\s\S]*?\}/)
    if (jsonMatch) {
      // 改行やスペースを正規化
      const jsonStr = jsonMatch[0].replace(/[\n\r]/g, ' ').replace(/\s+/g, ' ')
      return JSON.parse(jsonStr)
    }

    // シンプルなパターンも試す
    const simpleMatch = text.match(/\{[^{}]*"dirtyLevel"\s*:\s*\d+[^{}]*\}/)
    if (simpleMatch) {
      return JSON.parse(simpleMatch[0])
    }

    return null
  } catch (error) {
    console.error('JSON抽出エラー:', error)
    return null
  }
}

// カメラに戻る
const resetToCamera = () => {
  currentPhase.value = 'camera'
  capturedImage.value = null
  futureVisionUrl.value = null
  analysisResult.value = null
  cleanupSpots.value = []
  completedSpots.value = []
  startCamera()
}

// ホームに戻る
const goHome = () => {
  stopCamera()
  router.push('/')
}

onMounted(() => {
  startCamera()
  fetchUsageStatus()
})

onUnmounted(() => {
  stopCamera()
})
</script>

<template>
  <div class="min-h-screen bg-gray-900 font-jp">
    <div class="max-w-md mx-auto bg-black min-h-screen relative">
      <!-- ヘッダー -->
      <div class="bg-green-400 text-white text-center py-4 px-4 font-bold text-lg flex items-center justify-between">
        <button @click="goHome" class="text-white">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <span>{{
          currentPhase === 'vision' ? '未来の部屋' :
          currentPhase === 'spots_result' ? '片付けリスト' :
          'カメラ'
        }}</span>
        <div class="w-6"></div>
      </div>

      <!-- メインコンテンツエリア -->
      <div class="relative bg-black flex flex-col items-center justify-center" style="height: calc(100vh - 140px);">

        <!-- カメラプレビュー -->
        <video
          v-show="currentPhase === 'camera'"
          ref="videoRef"
          autoplay
          playsinline
          class="w-full h-full object-cover"
        ></video>

        <canvas ref="canvasRef" class="hidden"></canvas>

        <!-- 未来予想図生成中 -->
        <div
          v-if="currentPhase === 'generating'"
          class="absolute inset-0 bg-gradient-to-b from-blue-900 to-purple-900 flex items-center justify-center"
        >
          <div class="text-white text-center px-6">
            <div class="relative w-24 h-24 mx-auto mb-6">
              <div class="absolute inset-0 rounded-full border-4 border-purple-300 opacity-30"></div>
              <div class="absolute inset-0 rounded-full border-4 border-t-white animate-spin"></div>
              <div class="absolute inset-4 rounded-full bg-purple-500 opacity-50 animate-pulse"></div>
            </div>
            <p class="text-2xl font-bold mb-2">AI があなたの部屋を変身中...</p>
            <p class="text-sm opacity-70">ミニマリストな理想の部屋を生成中</p>
          </div>
        </div>

        <!-- 未来予想図表示 (STEP 2) - Before/After比較スライダー -->
        <div
          v-if="currentPhase === 'vision'"
          class="absolute inset-0 flex flex-col"
        >
          <!-- Before/After 比較スライダー -->
          <div
            ref="sliderContainerRef"
            class="flex-1 relative overflow-hidden cursor-ew-resize select-none"
            @mousedown="startDrag"
            @mousemove="onDrag"
            @mouseup="endDrag"
            @mouseleave="endDrag"
            @touchstart="startDrag"
            @touchmove="onDrag"
            @touchend="endDrag"
          >
            <!-- After画像（片付いた後）- 背景として全体表示 -->
            <img
              :src="futureVisionUrl"
              alt="片付いた後の未来予想図"
              class="absolute inset-0 w-full h-full object-cover"
              draggable="false"
            />

            <!-- Before画像（片付ける前）- clip-pathで部分表示 -->
            <div
              class="absolute inset-0 overflow-hidden"
              :style="{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }"
            >
              <img
                :src="capturedImage"
                alt="片付ける前の部屋"
                class="w-full h-full object-cover"
                draggable="false"
              />
            </div>

            <!-- スライダーライン -->
            <div
              class="absolute top-0 bottom-0 w-1 bg-white shadow-lg z-10"
              :style="{ left: `${sliderPosition}%`, transform: 'translateX(-50%)' }"
            >
              <!-- スライダーハンドル -->
              <div
                class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 bg-white rounded-full shadow-xl flex items-center justify-center"
              >
                <svg class="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                </svg>
              </div>
            </div>

            <!-- Before/Afterラベル -->
            <div class="absolute top-4 left-4 bg-black/60 text-white text-xs px-3 py-1.5 rounded-full font-medium">
              Before
            </div>
            <div class="absolute top-4 right-4 bg-white/90 text-gray-800 text-xs px-3 py-1.5 rounded-full font-medium">
              After ✨
            </div>

            <!-- テキスト（下部） -->
            <div class="absolute bottom-0 left-0 right-0 p-6 text-white pointer-events-none" style="text-shadow: 0 2px 8px rgba(0,0,0,0.8), 0 1px 3px rgba(0,0,0,0.9);">
              <p class="text-sm mb-1">スライダーを動かして比較</p>
              <p class="text-2xl font-bold mb-2">あなたの部屋の未来</p>
              <p class="text-sm">同じ部屋がこんなに綺麗に！一緒に目指しましょう</p>
            </div>
          </div>

          <!-- ボタンエリア -->
          <div class="bg-black p-6">
            <button
              @click="analyzeSpots"
              class="w-full py-4 bg-gradient-to-r from-green-400 to-teal-500 text-white rounded-2xl font-bold text-lg shadow-lg transform transition-transform active:scale-95"
            >
              片付ける！
            </button>
            <div class="flex gap-3 mt-3">
              <button
                @click="regenerateFutureImage"
                class="flex-1 py-3 bg-purple-600 text-white rounded-xl font-medium flex items-center justify-center gap-2 active:scale-95 transition-transform"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                もっと綺麗に
              </button>
              <button
                @click="resetToCamera"
                class="flex-1 py-3 bg-gray-800 text-gray-300 rounded-xl font-medium"
              >
                撮り直す
              </button>
            </div>
          </div>
        </div>

        <!-- 片付け場所分析中 -->
        <div
          v-if="currentPhase === 'analyzing_spots'"
          class="absolute inset-0 bg-gradient-to-b from-orange-600 to-red-700 flex items-center justify-center"
        >
          <div class="text-white text-center px-6">
            <div class="relative w-28 h-28 mx-auto mb-6">
              <!-- 外側の回転リング -->
              <div class="absolute inset-0 rounded-full border-4 border-orange-300 opacity-30"></div>
              <div class="absolute inset-0 rounded-full border-4 border-t-white border-r-white animate-spin"></div>
              <!-- 中央のパルス -->
              <div class="absolute inset-4 rounded-full bg-orange-500 opacity-60 animate-pulse"></div>
              <!-- 虫眼鏡アイコン -->
              <div class="absolute inset-0 flex items-center justify-center">
                <svg class="w-12 h-12 text-white animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
            <p class="text-2xl font-bold mb-2">片付けポイントを発見中...</p>
            <p class="text-sm opacity-80 mb-4">どこから始めれば効果的か分析しています</p>
            <div class="flex justify-center space-x-2">
              <div class="w-3 h-3 bg-white rounded-full animate-bounce" style="animation-delay: 0ms;"></div>
              <div class="w-3 h-3 bg-white rounded-full animate-bounce" style="animation-delay: 150ms;"></div>
              <div class="w-3 h-3 bg-white rounded-full animate-bounce" style="animation-delay: 300ms;"></div>
            </div>
          </div>
        </div>

        <!-- 片付け場所の結果表示 -->
        <div
          v-if="currentPhase === 'spots_result'"
          class="absolute inset-0 bg-gray-900 flex flex-col overflow-hidden"
        >
          <!-- 上部: 元の画像（小さく） -->
          <div class="relative h-32 flex-shrink-0">
            <img
              :src="capturedImage"
              alt="撮影した部屋"
              class="w-full h-full object-cover opacity-60"
            />
            <div class="absolute inset-0 bg-gradient-to-b from-transparent to-gray-900"></div>
            <div class="absolute bottom-2 left-4 text-white">
              <p class="text-xs opacity-70">推定時間</p>
              <p class="text-lg font-bold">{{ totalEstimatedTime }}</p>
            </div>
            <div class="absolute bottom-2 right-4 text-white text-right">
              <p class="text-xs opacity-70">完了</p>
              <p class="text-lg font-bold">{{ completedSpots.length }} / {{ cleanupSpots.length }}</p>
            </div>
          </div>

          <!-- 励ましメッセージ -->
          <div class="px-4 py-3 bg-gradient-to-r from-green-600 to-teal-600 text-white text-center">
            <p class="text-sm font-medium">{{ encouragement }}</p>
          </div>

          <!-- 片付けリスト -->
          <div class="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            <div
              v-for="(spot, index) in cleanupSpots"
              :key="index"
              @click="toggleSpotComplete(index)"
              class="bg-gray-800 rounded-xl p-4 cursor-pointer transition-all duration-300"
              :class="{
                'opacity-50 bg-gray-700': completedSpots.includes(index),
                'ring-2 ring-green-400': completedSpots.includes(index)
              }"
            >
              <div class="flex items-start gap-3">
                <!-- チェックボックス -->
                <div
                  class="w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors"
                  :class="completedSpots.includes(index) ? 'bg-green-500 border-green-500' : 'border-gray-500'"
                >
                  <svg
                    v-if="completedSpots.includes(index)"
                    class="w-4 h-4 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                  </svg>
                </div>

                <!-- コンテンツ -->
                <div class="flex-1">
                  <div class="flex items-center gap-2 mb-1">
                    <span
                      class="text-xs px-2 py-0.5 rounded-full text-white"
                      :class="getPriorityColor(spot.priority)"
                    >
                      {{ getPriorityLabel(spot.priority) }}
                    </span>
                    <span class="text-xs text-gray-400">{{ spot.estimatedTime }}</span>
                  </div>
                  <p class="text-white font-bold text-sm mb-1">{{ spot.location }}</p>
                  <p class="text-gray-400 text-xs mb-2">{{ spot.items }}</p>
                  <p
                    class="text-teal-400 text-sm"
                    :class="{ 'line-through text-gray-500': completedSpots.includes(index) }"
                  >
                    {{ spot.action }}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- 下部ボタン -->
          <div class="flex-shrink-0 bg-gray-900 p-4 border-t border-gray-800">
            <button
              v-if="completedSpots.length === cleanupSpots.length && cleanupSpots.length > 0"
              @click="goHome"
              class="w-full py-4 bg-gradient-to-r from-green-400 to-teal-500 text-white rounded-2xl font-bold text-lg shadow-lg"
            >
              完了！ホームに戻る
            </button>
            <button
              v-else
              @click="resetToCamera"
              class="w-full py-3 bg-gray-800 text-gray-300 rounded-xl font-medium"
            >
              最初からやり直す
            </button>
          </div>
        </div>

        <!-- 戦略的分析中 (STEP 3) -->
        <div
          v-if="currentPhase === 'analyzing'"
          class="absolute inset-0 bg-gradient-to-b from-green-900 to-teal-900 flex items-center justify-center"
        >
          <div class="text-white text-center px-6">
            <div class="relative w-24 h-24 mx-auto mb-6">
              <div class="absolute inset-0 rounded-full border-4 border-teal-300 opacity-30"></div>
              <div class="absolute inset-0 rounded-full border-4 border-t-white animate-spin"></div>
              <div class="absolute inset-4 flex items-center justify-center">
                <span class="text-3xl">&#x1F9E0;</span>
              </div>
            </div>
            <p class="text-2xl font-bold mb-2">戦略を立てています...</p>
            <p class="text-sm opacity-70">最も効果的なエリアを選定中</p>
          </div>
        </div>

        <!-- 分析完了 -->
        <div
          v-if="currentPhase === 'complete'"
          class="absolute inset-0 bg-gradient-to-b from-green-600 to-teal-700 flex items-center justify-center"
        >
          <div class="text-white text-center px-6">
            <div class="text-6xl mb-4">&#x1F389;</div>
            <p class="text-2xl font-bold mb-2">準備完了！</p>
            <p class="text-sm opacity-80">最適な片付けプランができました</p>
            <p class="text-xs opacity-60 mt-4">ホーム画面に移動します...</p>
          </div>
        </div>
      </div>

      <!-- カメラ撮影ボタン -->
      <div
        v-if="currentPhase === 'camera'"
        class="absolute bottom-0 left-0 right-0 max-w-md mx-auto bg-gray-900 p-6"
      >
        <!-- 隠しファイル入力 -->
        <input
          ref="fileInputRef"
          type="file"
          accept="image/*"
          class="hidden"
          @change="handleFileSelect"
        />

        <!-- 高画質モード切り替え -->
        <div class="mb-4 flex items-center justify-between bg-gray-800 rounded-xl p-3">
          <div class="flex items-center gap-2">
            <svg class="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
            </svg>
            <div>
              <p class="text-white text-sm font-medium">高画質モード</p>
              <p class="text-gray-400 text-xs">Proモデルで精度UP（残り {{ usageStatus.pro.limit - usageStatus.pro.used }} 回）</p>
            </div>
          </div>
          <button
            @click="highQualityMode = !highQualityMode"
            class="relative w-12 h-6 rounded-full transition-colors duration-200"
            :class="highQualityMode ? 'bg-yellow-500' : 'bg-gray-600'"
          >
            <span
              class="absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform duration-200"
              :class="highQualityMode ? 'translate-x-6' : 'translate-x-0.5'"
            ></span>
          </button>
        </div>

        <div class="flex justify-center items-center gap-8">
          <!-- ファイル選択ボタン -->
          <button
            @click="openFileSelector"
            class="w-14 h-14 rounded-full bg-gray-700 border-2 border-gray-500 flex items-center justify-center shadow-lg hover:bg-gray-600 transition-colors"
            title="ファイルから選択"
          >
            <svg class="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>

          <!-- 撮影ボタン -->
          <button
            @click="capturePhoto"
            class="w-20 h-20 rounded-full border-4 flex items-center justify-center shadow-lg transition-colors"
            :class="highQualityMode ? 'bg-yellow-400 border-yellow-300 hover:bg-yellow-300' : 'bg-white border-gray-300 hover:bg-gray-100'"
          >
            <div
              class="w-16 h-16 rounded-full border-2"
              :class="highQualityMode ? 'bg-yellow-400 border-yellow-500' : 'bg-white border-gray-400'"
            ></div>
          </button>

          <!-- スペーサー（バランス用） -->
          <div class="w-14 h-14"></div>
        </div>

        <p class="text-center text-gray-400 text-sm mt-4">部屋全体が映るように撮影してください</p>
        <p class="text-center text-gray-500 text-xs mt-1">
          {{ highQualityMode ? '高画質モードで生成します' : '通常モード（残り ' + (usageStatus.flash.limit - usageStatus.flash.used) + ' 回）' }}
        </p>
      </div>
    </div>
  </div>
</template>
