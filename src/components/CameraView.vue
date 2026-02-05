<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { generateFutureVision, analyzeCleanupSpots, getUsageStatus, analyzeStrategic } from '../utils/gemini.js'
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
    case 'high': return 'bg-red-500/80'
    case 'medium': return 'bg-amber-500/80'
    case 'low': return 'bg-emerald-500/80'
    default: return 'bg-slate-500/80'
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

// STEP 3: 戦略的分析を開始（Gemini統一版）
const startStrategicAnalysis = async () => {
  if (!capturedImage.value) return

  currentPhase.value = 'analyzing'

  try {
    const result = await analyzeStrategic(capturedImage.value)

    if (result.success) {
      analysisResult.value = result.analysis
      console.log('戦略的分析結果:', result.analysis)

      const jsonData = extractJsonFromAnalysis(result.analysis)
      console.log('抽出されたJSONデータ:', jsonData)

      if (jsonData) {
        roomStore.updateFromStrategicAnalysis({
          analysis: result.analysis,
          dirtyLevel: jsonData.dirtyLevel,
          selectedZone: jsonData.selectedZone,
          reason: jsonData.reason,
          tasks: jsonData.tasks,
          estimatedTime: jsonData.estimatedTime,
          zones: jsonData.zones,
        })
      } else {
        console.warn('JSONデータが抽出できませんでした')
        roomStore.setAnalysisResult(result.analysis)
      }

      currentPhase.value = 'complete'

      // 2秒後にホームへ遷移
      setTimeout(() => {
        goHome()
      }, 2000)
    } else {
      console.error('戦略的分析エラー:', result.error)
      alert('分析に失敗しました: ' + result.error)
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
  sliderPosition.value = 50
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
  <div class="min-h-screen bg-background-dark text-white overflow-hidden">
    <div class="relative flex h-screen w-full flex-col overflow-hidden max-w-[480px] mx-auto">

      <!-- ==================== カメラ画面 ==================== -->
      <template v-if="currentPhase === 'camera'">
        <!-- Camera Viewport (Background) -->
        <div class="absolute inset-0 z-0 overflow-hidden bg-slate-900">
          <video
            ref="videoRef"
            autoplay
            playsinline
            class="h-full w-full object-cover opacity-90"
          ></video>

          <!-- AI Scanning Reticle -->
          <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div class="relative w-64 h-64 border-2 border-primary/30 rounded-xl flex items-center justify-center">
              <div class="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-primary rounded-tl-xl"></div>
              <div class="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-primary rounded-tr-xl"></div>
              <div class="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-primary rounded-bl-xl"></div>
              <div class="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-primary rounded-br-xl"></div>
              <!-- AI Hint Label -->
              <div class="bg-primary/90 px-3 py-1.5 rounded-full text-xs font-semibold tracking-wider flex items-center gap-1.5">
                <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                </svg>
                <span>AI READY</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Top App Bar -->
        <div class="relative z-10 flex items-center p-6 justify-between pt-12">
          <button @click="goHome" class="flex size-10 shrink-0 items-center justify-center rounded-full glass-panel cursor-pointer">
            <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <!-- 高画質モード表示 -->
          <button
            @click="highQualityMode = !highQualityMode"
            class="glass-panel px-4 py-2 rounded-full flex items-center gap-2 border border-white/10"
          >
            <div
              class="size-2 rounded-full"
              :class="highQualityMode ? 'bg-green-400 animate-pulse' : 'bg-white/40'"
            ></div>
            <span class="text-white text-sm font-medium leading-tight tracking-wide">
              {{ highQualityMode ? '高画質モード' : '通常モード' }}
            </span>
          </button>

          <div class="flex size-10 shrink-0 items-center justify-center rounded-full glass-panel">
            <svg class="w-5 h-5 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
        </div>

        <!-- Spacer -->
        <div class="flex-1"></div>

        <!-- Bottom Controls -->
        <div class="relative z-10 pb-10 px-6">
          <!-- 隠しファイル入力 -->
          <input
            ref="fileInputRef"
            type="file"
            accept="image/*"
            class="hidden"
            @change="handleFileSelect"
          />

          <div class="flex items-center justify-between gap-4">
            <!-- Gallery Thumbnail -->
            <button
              @click="openFileSelector"
              class="flex shrink-0 items-center justify-center rounded-full size-14 glass-panel overflow-hidden border border-white/20"
            >
              <svg class="w-6 h-6 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </button>

            <!-- Shutter Button -->
            <div class="flex-1 flex justify-center">
              <button
                @click="capturePhoto"
                class="relative flex items-center justify-center rounded-full size-20 p-1 group"
                :class="highQualityMode ? 'bg-primary/30 border-2 border-primary/50' : 'bg-white/20 border-2 border-white/30'"
              >
                <div
                  class="size-full rounded-full soft-glow flex items-center justify-center shutter-outer"
                  :class="highQualityMode ? 'bg-primary' : 'bg-white'"
                >
                  <div
                    class="size-14 rounded-full border"
                    :class="highQualityMode ? 'border-primary-light' : 'border-slate-200'"
                  ></div>
                </div>
              </button>
            </div>

            <!-- Placeholder for balance -->
            <div class="flex shrink-0 items-center justify-center rounded-full size-14 opacity-0">
            </div>
          </div>

          <!-- Hint Text -->
          <p class="text-center text-white/50 text-xs mt-6 tracking-wide">
            部屋全体が映るように撮影してください
          </p>
          <p class="text-center text-white/30 text-[10px] mt-1 tracking-wide">
            {{ highQualityMode ? 'Pro モデル（残り ' + (usageStatus.pro.limit - usageStatus.pro.used) + ' 回）' : 'Flash モデル（残り ' + (usageStatus.flash.limit - usageStatus.flash.used) + ' 回）' }}
          </p>
        </div>

        <!-- Bottom Navigation -->
        <div class="relative z-10 flex gap-2 border-t border-white/5 bg-background-dark/80 px-4 pb-8 pt-3 backdrop-blur-md">
          <button @click="goHome" class="flex flex-1 flex-col items-center justify-center gap-1 text-white/40">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </button>
          <button class="flex flex-1 flex-col items-center justify-center gap-1 text-primary">
            <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 9a3 3 0 100 6 3 3 0 000-6zm0-2a5 5 0 110 10 5 5 0 010-10zm6.5-.25a1.25 1.25 0 11-2.5 0 1.25 1.25 0 012.5 0zM12 4c-2.474 0-2.878.007-3.88.056-.948.043-1.593.196-2.158.418a4.376 4.376 0 00-1.58 1.03 4.376 4.376 0 00-1.03 1.58c-.222.565-.375 1.21-.418 2.158C2.007 10.122 2 10.526 2 13s.007 2.878.056 3.88c.043.948.196 1.593.418 2.158.227.592.53 1.094 1.03 1.58.486.5.988.803 1.58 1.03.565.222 1.21.375 2.158.418 1.002.049 1.406.056 3.88.056s2.878-.007 3.88-.056c.948-.043 1.593-.196 2.158-.418a4.376 4.376 0 001.58-1.03 4.376 4.376 0 001.03-1.58c.222-.565.375-1.21.418-2.158.049-1.002.056-1.406.056-3.88s-.007-2.878-.056-3.88c-.043-.948-.196-1.593-.418-2.158a4.376 4.376 0 00-1.03-1.58 4.376 4.376 0 00-1.58-1.03c-.565-.222-1.21-.375-2.158-.418C14.878 4.007 14.474 4 12 4z" />
            </svg>
          </button>
          <button class="flex flex-1 flex-col items-center justify-center gap-1 text-white/40">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
          <button class="flex flex-1 flex-col items-center justify-center gap-1 text-white/40">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </button>
        </div>
      </template>

      <!-- ==================== 生成中画面 ==================== -->
      <div
        v-if="currentPhase === 'generating'"
        class="absolute inset-0 bg-cream flex flex-col items-center justify-between py-16 px-6 z-50 overflow-hidden"
      >
        <!-- 下から満たされる背景アニメーション -->
        <div class="absolute inset-0 z-0 overflow-hidden">
          <!-- 満たされるメイン層（しっかり見える色） -->
          <div class="absolute bottom-0 left-0 right-0 room-fill-animation">
            <div class="absolute inset-0 bg-gradient-to-t from-[#d4e4d6] via-[#e2ebe3] to-[#F2EFE9]"></div>
          </div>
          <!-- 波打つエフェクト（上端） -->
          <div class="absolute left-0 right-0 wave-container">
            <svg class="w-full h-16" viewBox="0 0 1440 60" preserveAspectRatio="none">
              <path class="wave-path-1" fill="#e2ebe3" d="M0,30 C360,60 720,0 1080,30 C1260,45 1350,50 1440,30 L1440,60 L0,60 Z"/>
              <path class="wave-path-2" fill="#d4e4d6" opacity="0.6" d="M0,35 C360,5 720,55 1080,25 C1260,10 1350,40 1440,35 L1440,60 L0,60 Z"/>
            </svg>
          </div>
          <!-- キラキラパーティクル -->
          <div class="particle particle-1"></div>
          <div class="particle particle-2"></div>
          <div class="particle particle-3"></div>
          <div class="particle particle-4"></div>
          <div class="particle particle-5"></div>
        </div>

        <!-- Header -->
        <div class="z-10 text-center mt-4 header-fade-in">
          <div class="mb-4 inline-flex items-center justify-center size-14 rounded-full bg-sage-green/10 magic-icon-pulse">
            <svg class="w-7 h-7 text-sage-green" fill="currentColor" viewBox="0 0 24 24">
              <path d="M7.5 5.6L10 7 8.6 4.5 10 2 7.5 3.4 5 2l1.4 2.5L5 7zm12 9.8L17 14l1.4 2.5L17 19l2.5-1.4L22 19l-1.4-2.5L22 14zM22 2l-2.5 1.4L17 2l1.4 2.5L17 7l2.5-1.4L22 7l-1.4-2.5zm-7.63 5.29a.996.996 0 00-1.41 0L1.29 18.96a.996.996 0 000 1.41l2.34 2.34c.39.39 1.02.39 1.41 0L16.7 11.05a.996.996 0 000-1.41l-2.33-2.35zm-1.03 5.49l-2.12-2.12 2.44-2.44 2.12 2.12-2.44 2.44z"/>
            </svg>
          </div>
          <p class="text-sage-green text-sm font-bold tracking-widest uppercase">AI Processing</p>
        </div>

        <!-- Furniture Icons with Pop-up Animation -->
        <div class="relative z-10 flex flex-col items-center justify-center w-full max-w-sm flex-1">
          <div class="grid grid-cols-3 gap-6 items-center justify-center relative">
            <!-- Chair - 1番目にポップアップ -->
            <div class="flex flex-col items-center gap-2 furniture-popup furniture-1">
              <div class="size-24 rounded-[2.5rem] bg-soft-beige shadow-sm flex items-center justify-center border-2 border-white/50 furniture-float">
                <svg class="w-10 h-10 text-sage-green" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M7 13c1.66 0 3-1.34 3-3S8.66 7 7 7s-3 1.34-3 3 1.34 3 3 3zm12-6h-8v7H3V6H1v15h2v-3h18v3h2v-9c0-2.21-1.79-4-4-4z"/>
                </svg>
              </div>
              <span class="text-sage-green/60 text-[10px] font-medium tracking-wider furniture-label">ソファ</span>
            </div>
            <!-- Plant - 2番目にポップアップ -->
            <div class="flex flex-col items-center gap-2 -translate-y-8 furniture-popup furniture-2">
              <div class="size-20 rounded-[2rem] bg-soft-beige shadow-sm flex items-center justify-center border-2 border-white/50 furniture-float-delayed">
                <svg class="w-8 h-8 text-sage-green/80" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 22a4 4 0 01-4-4c0-3 2-4 2-8 0 0 1 1 3 1s3-1 3-1c0 4 2 5 2 8a4 4 0 01-4 4zm-6-9c-1.5 0-3-.5-4.5-2 2.5-.5 3.5-2 4-4 1 2.5 3 3 4.5 3-1.5 1-2.5 3-4 3zm12 0c-1.5 0-2.5-2-4-3 1.5 0 3.5-.5 4.5-3 .5 2 1.5 3.5 4 4-1.5 1.5-3 2-4.5 2z"/>
                </svg>
              </div>
              <span class="text-sage-green/60 text-[10px] font-medium tracking-wider furniture-label">グリーン</span>
            </div>
            <!-- Light - 3番目にポップアップ -->
            <div class="flex flex-col items-center gap-2 furniture-popup furniture-3">
              <div class="size-20 rounded-[2rem] bg-soft-beige shadow-sm flex items-center justify-center border-2 border-white/50 furniture-float">
                <svg class="w-8 h-8 text-sage-green/80" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z"/>
                </svg>
              </div>
              <span class="text-sage-green/60 text-[10px] font-medium tracking-wider furniture-label">ライト</span>
            </div>

            <!-- Decorative sparkles with animation -->
            <div class="absolute -top-6 -right-4 sparkle sparkle-1">
              <svg class="w-6 h-6 text-sage-green/40" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
              </svg>
            </div>
            <div class="absolute top-1/3 -left-10 sparkle sparkle-2">
              <svg class="w-5 h-5 text-sage-green/30" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5z"/>
              </svg>
            </div>
            <div class="absolute -bottom-4 right-1/4 sparkle sparkle-3">
              <svg class="w-4 h-4 text-sage-green/25" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
              </svg>
            </div>
            <div class="absolute top-0 left-1/4 sparkle sparkle-4">
              <svg class="w-3 h-3 text-sage-green/35" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9z"/>
              </svg>
            </div>
          </div>
        </div>

        <!-- Bottom Content -->
        <div class="relative z-10 w-full flex flex-col items-center gap-8 mb-8 bottom-content-fade">
          <div class="space-y-3 text-center">
            <h1 class="text-text-main tracking-tight text-[26px] font-bold px-4">
              魔法をかけています...
            </h1>
            <p class="text-sage-green text-base font-medium">
              AIがあなたのお部屋を理想の空間へ
            </p>
          </div>

          <!-- Progress Bar -->
          <div class="w-full max-w-[280px] flex flex-col gap-4">
            <div class="flex justify-between items-end px-1">
              <div class="flex items-center gap-2">
                <span class="flex h-2 w-2 rounded-full bg-sage-green opacity-70 animate-pulse"></span>
                <p class="text-text-main text-sm font-medium">家具を整頓中...</p>
              </div>
            </div>
            <div class="h-3.5 w-full rounded-full bg-soft-beige overflow-hidden p-0.5 border border-white/50">
              <div class="h-full rounded-full bg-sage-green generating-progress"></div>
            </div>
            <p class="text-text-light text-[13px] text-center font-normal">
              あと少しで完了します。このままお待ちください。
            </p>
          </div>
        </div>

        <!-- Decorative blurs -->
        <div class="absolute -bottom-20 -left-20 size-64 bg-sage-green/5 rounded-full blur-3xl animate-pulse"></div>
        <div class="absolute top-1/4 -right-20 size-64 bg-soft-beige/40 rounded-full blur-3xl"></div>
      </div>

      <!-- ==================== 未来予想図表示 ==================== -->
      <div
        v-if="currentPhase === 'vision'"
        class="absolute inset-0 flex flex-col bg-cream"
      >
        <!-- Header -->
        <header class="flex items-center bg-cream/80 backdrop-blur-md sticky top-0 z-50 px-6 py-4 justify-between">
          <button @click="resetToCamera" class="flex size-10 items-center justify-center rounded-full bg-soft-beige soft-shadow">
            <svg class="w-5 h-5 text-text-main" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 class="text-text-main text-sm font-light leading-tight tracking-[0.15em] flex-1 text-center">かたづけナビ AI</h2>
          <div class="flex size-10 items-center justify-end">
            <button class="flex items-center justify-center rounded-full h-10 w-10 bg-soft-beige soft-shadow overflow-hidden">
              <svg class="w-5 h-5 text-text-main" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </button>
          </div>
        </header>

        <!-- Title -->
        <div class="pt-6 pb-4 text-center">
          <h1 class="text-text-main text-2xl font-extralight leading-tight">未来予想図</h1>
          <p class="text-text-light text-xs tracking-widest mt-2 font-light">お部屋が綺麗になった後のイメージです</p>
        </div>

        <!-- Before/After 比較スライダー -->
        <div class="flex-1 px-6 pb-4">
          <div
            ref="sliderContainerRef"
            class="relative w-full h-full bg-white rounded-3xl soft-shadow overflow-hidden cursor-ew-resize select-none border border-white/50"
            @mousedown="startDrag"
            @mousemove="onDrag"
            @mouseup="endDrag"
            @mouseleave="endDrag"
            @touchstart="startDrag"
            @touchmove="onDrag"
            @touchend="endDrag"
          >
            <!-- After画像 -->
            <img
              :src="futureVisionUrl"
              alt="片付いた後の未来予想図"
              class="absolute inset-0 w-full h-full object-cover"
              draggable="false"
            />

            <!-- Before画像 -->
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
              class="absolute top-0 bottom-0 w-0.5 bg-white/80 z-10"
              :style="{ left: `${sliderPosition}%`, transform: 'translateX(-50%)' }"
            >
              <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 bg-white/90 rounded-full soft-shadow border border-white flex items-center justify-center">
                <svg class="w-5 h-5 text-sage-muted rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                </svg>
              </div>
            </div>

            <!-- Labels -->
            <div class="absolute top-3 left-3 bg-black/20 backdrop-blur-md text-white text-[10px] px-3 py-1 rounded-full font-light tracking-widest uppercase">
              Before
            </div>
            <div class="absolute top-3 right-3 bg-black/20 backdrop-blur-md text-white text-[10px] px-3 py-1 rounded-full font-light tracking-widest uppercase">
              After
            </div>
          </div>
        </div>

        <!-- ボタンエリア -->
        <div class="px-6 pb-32 flex flex-col gap-4">
          <button
            @click="analyzeSpots"
            class="w-full py-5 rounded-full bg-sage-muted text-white text-sm tracking-[0.2em] font-light soft-shadow transition-transform active:scale-[0.98]"
          >
            片付ける！
          </button>
          <button
            @click="regenerateFutureImage"
            class="w-full py-5 rounded-full bg-white text-text-main text-sm tracking-[0.2em] font-light soft-shadow border border-white/50 active:scale-[0.98] transition-transform"
          >
            もっと綺麗に
          </button>
          <button
            @click="resetToCamera"
            class="mt-2 text-text-light text-xs font-light tracking-widest underline underline-offset-4 active:opacity-60 text-center"
          >
            撮り直す
          </button>
        </div>

        <!-- Bottom Navigation -->
        <nav class="fixed bottom-8 left-1/2 -translate-x-1/2 w-[85%] max-w-[340px] bg-white/70 backdrop-blur-xl border border-white/50 rounded-full px-4 py-3 flex items-center justify-around soft-shadow z-50">
          <button @click="goHome" class="text-text-light flex flex-col items-center gap-0.5 p-2">
            <svg class="w-[22px] h-[22px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span class="text-[9px] font-light tracking-tighter uppercase">Home</span>
          </button>
          <button class="text-sage-muted flex flex-col items-center gap-0.5 p-2">
            <svg class="w-[22px] h-[22px]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5z"/>
            </svg>
            <span class="text-[9px] font-light tracking-tighter uppercase">Plan</span>
          </button>
          <button class="text-text-light flex flex-col items-center gap-0.5 p-2">
            <svg class="w-[22px] h-[22px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span class="text-[9px] font-light tracking-tighter uppercase">Log</span>
          </button>
          <button class="text-text-light flex flex-col items-center gap-0.5 p-2">
            <svg class="w-[22px] h-[22px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span class="text-[9px] font-light tracking-tighter uppercase">Set</span>
          </button>
        </nav>
      </div>

      <!-- ==================== 片付け場所分析中 ==================== -->
      <div
        v-if="currentPhase === 'analyzing_spots'"
        class="absolute inset-0 bg-gradient-to-b from-amber-600 to-background-dark flex items-center justify-center z-50"
      >
        <div class="text-white text-center px-6">
          <div class="relative w-28 h-28 mx-auto mb-8">
            <div class="absolute inset-0 rounded-full border-2 border-white/20"></div>
            <div class="absolute inset-0 rounded-full border-2 border-t-white animate-spin"></div>
            <div class="absolute inset-0 flex items-center justify-center">
              <svg class="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
          <p class="text-2xl font-semibold mb-2 tracking-wide">分析中...</p>
          <p class="text-sm text-white/60 tracking-wide">効果的な片付けポイントを探しています</p>
        </div>
      </div>

      <!-- ==================== 片付け場所の結果表示 ==================== -->
      <div
        v-if="currentPhase === 'spots_result'"
        class="absolute inset-0 bg-background-dark flex flex-col overflow-hidden"
      >
        <!-- Header -->
        <div class="relative h-36 flex-shrink-0">
          <img
            :src="capturedImage"
            alt="撮影した部屋"
            class="w-full h-full object-cover opacity-40"
          />
          <div class="absolute inset-0 bg-gradient-to-b from-transparent to-background-dark"></div>
          <div class="absolute bottom-4 left-6 right-6 flex justify-between items-end">
            <div>
              <p class="text-white/50 text-[10px] tracking-widest uppercase">Total Time</p>
              <p class="text-white text-xl font-semibold">{{ totalEstimatedTime }}</p>
            </div>
            <div class="text-right">
              <p class="text-white/50 text-[10px] tracking-widest uppercase">Progress</p>
              <p class="text-white text-xl font-semibold">{{ completedSpots.length }}<span class="text-white/50 text-sm"> / {{ cleanupSpots.length }}</span></p>
            </div>
          </div>
        </div>

        <!-- 励ましメッセージ -->
        <div class="px-6 py-4 glass-panel mx-6 -mt-2 rounded-2xl border border-white/10">
          <p class="text-white/80 text-sm text-center font-light">{{ encouragement }}</p>
        </div>

        <!-- 片付けリスト -->
        <div class="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          <div
            v-for="(spot, index) in cleanupSpots"
            :key="index"
            @click="toggleSpotComplete(index)"
            class="glass-panel rounded-2xl p-4 cursor-pointer transition-all duration-300 border"
            :class="completedSpots.includes(index) ? 'opacity-50 border-primary/50' : 'border-white/10'"
          >
            <div class="flex items-start gap-3">
              <div
                class="w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors mt-0.5"
                :class="completedSpots.includes(index) ? 'bg-primary border-primary' : 'border-white/30'"
              >
                <svg
                  v-if="completedSpots.includes(index)"
                  class="w-3.5 h-3.5 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                </svg>
              </div>

              <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                  <span
                    class="text-[10px] px-2 py-0.5 rounded-full text-white font-medium tracking-wide uppercase"
                    :class="getPriorityColor(spot.priority)"
                  >
                    {{ getPriorityLabel(spot.priority) }}
                  </span>
                  <span class="text-[10px] text-white/40">{{ spot.estimatedTime }}</span>
                </div>
                <p class="text-white font-medium text-sm mb-1">{{ spot.location }}</p>
                <p class="text-white/40 text-xs mb-2">{{ spot.items }}</p>
                <p
                  class="text-primary text-sm"
                  :class="{ 'line-through text-white/30': completedSpots.includes(index) }"
                >
                  {{ spot.action }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- 下部ボタン -->
        <div class="flex-shrink-0 p-6 pb-10">
          <button
            v-if="completedSpots.length === cleanupSpots.length && cleanupSpots.length > 0"
            @click="goHome"
            class="w-full py-4 rounded-full bg-primary text-white text-sm tracking-[0.15em] font-semibold soft-glow uppercase"
          >
            完了！ホームへ戻る
          </button>
          <button
            v-else
            @click="resetToCamera"
            class="w-full py-3 glass-panel text-white/60 rounded-full text-xs tracking-wide font-medium border border-white/10"
          >
            最初からやり直す
          </button>
        </div>
      </div>

      <!-- ==================== 戦略的分析中 ==================== -->
      <div
        v-if="currentPhase === 'analyzing'"
        class="absolute inset-0 bg-gradient-to-b from-emerald-600 to-background-dark flex items-center justify-center z-50"
      >
        <div class="text-white text-center px-6">
          <div class="relative w-28 h-28 mx-auto mb-8">
            <div class="absolute inset-0 rounded-full border-2 border-white/20"></div>
            <div class="absolute inset-0 rounded-full border-2 border-t-white animate-spin"></div>
            <div class="absolute inset-0 flex items-center justify-center text-4xl">
              🧠
            </div>
          </div>
          <p class="text-2xl font-semibold mb-2 tracking-wide">戦略を立案中...</p>
          <p class="text-sm text-white/60 tracking-wide">最適なエリアを選定しています</p>
        </div>
      </div>

      <!-- ==================== 分析完了 ==================== -->
      <div
        v-if="currentPhase === 'complete'"
        class="absolute inset-0 bg-gradient-to-b from-primary to-background-dark flex items-center justify-center z-50"
      >
        <div class="text-white text-center px-6">
          <div class="text-6xl mb-6">🎉</div>
          <p class="text-2xl font-semibold mb-2 tracking-wide">準備完了！</p>
          <p class="text-sm text-white/60 tracking-wide">最適なプランができました</p>
          <p class="text-xs text-white/40 mt-6">ホーム画面に移動します...</p>
        </div>
      </div>

      <canvas ref="canvasRef" class="hidden"></canvas>
    </div>
  </div>
</template>

<style scoped>
/* ==================== Primary (Dark Theme) Colors ==================== */
.bg-primary {
  background-color: #195de6;
}
.bg-primary\/90 {
  background-color: rgba(25, 93, 230, 0.9);
}
.bg-primary\/30 {
  background-color: rgba(25, 93, 230, 0.3);
}
.bg-primary\/20 {
  background-color: rgba(25, 93, 230, 0.2);
}
.text-primary {
  color: #195de6;
}
.border-primary {
  border-color: #195de6;
}
.border-primary\/50 {
  border-color: rgba(25, 93, 230, 0.5);
}
.border-primary\/30 {
  border-color: rgba(25, 93, 230, 0.3);
}
.border-primary-light {
  border-color: rgba(25, 93, 230, 0.6);
}
.bg-background-dark {
  background-color: #111621;
}
.bg-background-dark\/80 {
  background-color: rgba(17, 22, 33, 0.8);
}

/* ==================== Light Theme Colors ==================== */
.bg-cream {
  background-color: #F9F7F2;
}
.bg-cream\/80 {
  background-color: rgba(249, 247, 242, 0.8);
}
.bg-soft-beige {
  background-color: #F2EFE9;
}
.bg-soft-beige\/40 {
  background-color: rgba(242, 239, 233, 0.4);
}
.bg-sage-green {
  background-color: #8DAA91;
}
.bg-sage-green\/10 {
  background-color: rgba(141, 170, 145, 0.1);
}
.bg-sage-green\/5 {
  background-color: rgba(141, 170, 145, 0.05);
}
.bg-sage-muted {
  background-color: #9EB3A2;
}
.text-sage-green {
  color: #8DAA91;
}
.text-sage-green\/80 {
  color: rgba(141, 170, 145, 0.8);
}
.text-sage-green\/30 {
  color: rgba(141, 170, 145, 0.3);
}
.text-sage-green\/20 {
  color: rgba(141, 170, 145, 0.2);
}
.text-sage-muted {
  color: #9EB3A2;
}
.text-text-main {
  color: #5C564E;
}
.text-text-light {
  color: #8E8A82;
}

/* ==================== Neumorphism ==================== */
.soft-shadow {
  box-shadow: 4px 4px 12px rgba(0, 0, 0, 0.03), -4px -4px 12px rgba(255, 255, 255, 0.8);
}
.soft-inset {
  box-shadow: inset 2px 2px 5px rgba(0, 0, 0, 0.02), inset -2px -2px 5px rgba(255, 255, 255, 0.7);
}

/* ==================== 生成中画面のアニメーション ==================== */

/* 下から満たされるアニメーション */
.room-fill-animation {
  height: 0%;
  animation: room-fill 10s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}
@keyframes room-fill {
  0% { height: 0%; }
  15% { height: 20%; }
  30% { height: 35%; }
  50% { height: 50%; }
  70% { height: 65%; }
  85% { height: 75%; }
  100% { height: 82%; }
}

/* 波のコンテナ（満たされる層の上端に追従） */
.wave-container {
  bottom: 0;
  animation: wave-rise 10s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}
@keyframes wave-rise {
  0% { bottom: 0%; }
  15% { bottom: 20%; }
  30% { bottom: 35%; }
  50% { bottom: 50%; }
  70% { bottom: 65%; }
  85% { bottom: 75%; }
  100% { bottom: 82%; }
}

/* 波のうねりアニメーション */
.wave-path-1 {
  animation: wave-motion-1 3s ease-in-out infinite;
}
.wave-path-2 {
  animation: wave-motion-2 4s ease-in-out infinite;
}
@keyframes wave-motion-1 {
  0%, 100% { d: path("M0,30 C360,60 720,0 1080,30 C1260,45 1350,50 1440,30 L1440,60 L0,60 Z"); }
  50% { d: path("M0,30 C360,0 720,60 1080,30 C1260,15 1350,10 1440,30 L1440,60 L0,60 Z"); }
}
@keyframes wave-motion-2 {
  0%, 100% { d: path("M0,35 C360,5 720,55 1080,25 C1260,10 1350,40 1440,35 L1440,60 L0,60 Z"); }
  50% { d: path("M0,25 C360,55 720,5 1080,35 C1260,50 1350,20 1440,25 L1440,60 L0,60 Z"); }
}

/* キラキラパーティクル */
.particle {
  position: absolute;
  width: 8px;
  height: 8px;
  background: radial-gradient(circle, rgba(141, 170, 145, 0.8) 0%, transparent 70%);
  border-radius: 50%;
  animation: particle-float 10s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  opacity: 0;
}
.particle-1 { left: 15%; animation-delay: 0.5s; }
.particle-2 { left: 35%; animation-delay: 1.2s; width: 6px; height: 6px; }
.particle-3 { left: 55%; animation-delay: 0.8s; width: 10px; height: 10px; }
.particle-4 { left: 75%; animation-delay: 1.5s; width: 5px; height: 5px; }
.particle-5 { left: 90%; animation-delay: 2s; width: 7px; height: 7px; }

@keyframes particle-float {
  0% { bottom: 0%; opacity: 0; transform: scale(0); }
  10% { opacity: 1; transform: scale(1); }
  15% { bottom: 20%; }
  30% { bottom: 35%; }
  50% { bottom: 50%; opacity: 0.8; }
  70% { bottom: 65%; }
  85% { bottom: 75%; opacity: 0.5; }
  100% { bottom: 85%; opacity: 0; transform: scale(0.5); }
}

/* ヘッダーのフェードイン */
.header-fade-in {
  animation: fade-in-down 0.8s ease-out forwards;
}
@keyframes fade-in-down {
  0% { opacity: 0; transform: translateY(-20px); }
  100% { opacity: 1; transform: translateY(0); }
}

/* 魔法アイコンのパルス */
.magic-icon-pulse {
  animation: magic-pulse 2s ease-in-out infinite;
}
@keyframes magic-pulse {
  0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(141, 170, 145, 0.4); }
  50% { transform: scale(1.05); box-shadow: 0 0 20px 10px rgba(141, 170, 145, 0.1); }
}

/* 家具のポップアップアニメーション */
.furniture-popup {
  opacity: 0;
  transform: scale(0.3) translateY(40px);
  animation: furniture-pop 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
.furniture-1 { animation-delay: 0.3s; }
.furniture-2 { animation-delay: 0.6s; }
.furniture-3 { animation-delay: 0.9s; }

@keyframes furniture-pop {
  0% {
    opacity: 0;
    transform: scale(0.3) translateY(40px);
  }
  60% {
    opacity: 1;
    transform: scale(1.1) translateY(-5px);
  }
  80% {
    transform: scale(0.95) translateY(2px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

/* 家具のふわふわ浮遊アニメーション */
.furniture-float {
  animation: float 3s ease-in-out infinite;
  animation-delay: 1.2s;
}
.furniture-float-delayed {
  animation: float 3.5s ease-in-out infinite;
  animation-delay: 1.5s;
}
@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

/* 家具ラベルのフェードイン */
.furniture-label {
  opacity: 0;
  animation: label-fade 0.5s ease-out forwards;
}
.furniture-1 .furniture-label { animation-delay: 0.8s; }
.furniture-2 .furniture-label { animation-delay: 1.1s; }
.furniture-3 .furniture-label { animation-delay: 1.4s; }
@keyframes label-fade {
  0% { opacity: 0; transform: translateY(5px); }
  100% { opacity: 1; transform: translateY(0); }
}

/* スパークルのきらめきアニメーション */
.sparkle {
  opacity: 0;
  animation: sparkle-twinkle 2s ease-in-out infinite;
}
.sparkle-1 { animation-delay: 1.2s; }
.sparkle-2 { animation-delay: 1.8s; }
.sparkle-3 { animation-delay: 2.4s; }
.sparkle-4 { animation-delay: 0.6s; }

@keyframes sparkle-twinkle {
  0%, 100% { opacity: 0; transform: scale(0.5) rotate(0deg); }
  50% { opacity: 1; transform: scale(1.2) rotate(180deg); }
}

/* ボトムコンテンツのフェードイン */
.bottom-content-fade {
  animation: fade-in-up 0.8s ease-out 0.5s forwards;
  opacity: 0;
}
@keyframes fade-in-up {
  0% { opacity: 0; transform: translateY(20px); }
  100% { opacity: 1; transform: translateY(0); }
}

/* Generating progress bar animation */
.generating-progress {
  animation: progress-grow 8s ease-out forwards;
}
@keyframes progress-grow {
  0% { width: 5%; }
  20% { width: 25%; }
  40% { width: 45%; }
  60% { width: 60%; }
  80% { width: 75%; }
  95% { width: 90%; }
  100% { width: 95%; }
}

/* ==================== Glass Panel (Dark Theme) ==================== */
.glass-panel {
  background: rgba(28, 31, 38, 0.6);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

/* ==================== Soft Glow ==================== */
.soft-glow {
  box-shadow: 0 0 20px rgba(255, 255, 255, 0.3);
}

/* ==================== Shutter Button ==================== */
.shutter-outer {
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
}
</style>
