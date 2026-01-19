<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { analyzeImageWithClaude } from '../utils/claude.js'
import { generateFutureVision, analyzeCleanupSpots } from '../utils/gemini.js'
import { useRoomStore } from '../stores/room.js'

const router = useRouter()
const roomStore = useRoomStore()

const videoRef = ref(null)
const canvasRef = ref(null)
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

// カメラを停止
const stopCamera = () => {
  if (stream.value) {
    stream.value.getTracks().forEach(track => track.stop())
    stream.value = null
  }
}

// STEP 1: 未来予想図を生成（Gemini Image-to-Image）
const generateFutureImage = async () => {
  currentPhase.value = 'generating'

  try {
    // Gemini に撮影した画像を渡して、片付いた状態に変換
    const result = await generateFutureVision(capturedImage.value)

    if (result.success) {
      futureVisionUrl.value = result.imageUrl
      roomStore.setFutureVisionUrl(result.imageUrl)
      currentPhase.value = 'vision'
      console.log('未来予想図を生成しました（Gemini）')
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

        <!-- 未来予想図表示 (STEP 2) -->
        <div
          v-if="currentPhase === 'vision'"
          class="absolute inset-0 flex flex-col"
        >
          <!-- 未来予想図画像 -->
          <div class="flex-1 relative overflow-hidden">
            <img
              :src="futureVisionUrl"
              alt="片付いた後の未来予想図"
              class="w-full h-full object-cover"
            />
            <!-- グラデーションオーバーレイ -->
            <div class="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent"></div>

            <!-- テキストオーバーレイ -->
            <div class="absolute bottom-0 left-0 right-0 p-6 text-white">
              <p class="text-sm opacity-80 mb-1">AI が変身させた</p>
              <p class="text-2xl font-bold mb-2">あなたの部屋の未来</p>
              <p class="text-sm opacity-70">同じ部屋がこんなに綺麗に！一緒に目指しましょう</p>
            </div>
          </div>

          <!-- 片付けを始めるボタン -->
          <div class="bg-black p-6">
            <button
              @click="analyzeSpots"
              class="w-full py-4 bg-gradient-to-r from-green-400 to-teal-500 text-white rounded-2xl font-bold text-lg shadow-lg transform transition-transform active:scale-95"
            >
              片付ける！
            </button>
            <button
              @click="resetToCamera"
              class="w-full mt-3 py-3 bg-gray-800 text-gray-300 rounded-xl font-medium"
            >
              撮り直す
            </button>
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
        <div class="flex justify-center items-center">
          <button
            @click="capturePhoto"
            class="w-20 h-20 rounded-full bg-white border-4 border-gray-300 flex items-center justify-center shadow-lg hover:bg-gray-100 transition-colors"
          >
            <div class="w-16 h-16 rounded-full bg-white border-2 border-gray-400"></div>
          </button>
        </div>
        <p class="text-center text-gray-400 text-sm mt-4">部屋全体が映るように撮影してください</p>
      </div>
    </div>
  </div>
</template>
