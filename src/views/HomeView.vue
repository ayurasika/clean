<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useRoomStore } from '../stores/room.js'

const router = useRouter()
const roomStore = useRoomStore()

// ストアから状態を取得
const dirtyRoomLevel = computed(() => roomStore.dirtyLevel)
const dirtyRoomMessage = computed(() => roomStore.dirtyLevelMessage)
const currentMission = computed(() => roomStore.currentMission)
const nextTasks = computed(() => roomStore.nextTasks)
const selectedZone = computed(() => roomStore.selectedZone)
const zoneReason = computed(() => roomStore.zoneReason)
const estimatedTime = computed(() => roomStore.estimatedTime)
const hasAnalysis = computed(() => roomStore.hasAnalysis)
const futureVisionUrl = computed(() => roomStore.futureVisionUrl)

// 完了ボタンの処理
const completeMission = () => {
  roomStore.completeMission()
  console.log('ミッション完了:', currentMission.value.text)
}

// カメラ画面への遷移
const goToCamera = () => {
  router.push('/camera')
}
</script>

<template>
  <div class="min-h-screen bg-blue-100 font-jp">
    <!-- スマートフォン風のコンテナ -->
    <div class="max-w-md mx-auto bg-white min-h-screen relative overflow-hidden">
      <!-- アプリヘッダー -->
      <div class="bg-green-400 text-white text-center py-4 px-4 font-bold text-lg">
        かたづけナビ AI
      </div>

      <!-- メインコンテンツエリア -->
      <div class="px-4 py-6 space-y-5 pb-24">
        <!-- 汚部屋レベルプログレスバー -->
        <div class="relative">
          <!-- 星の装飾 -->
          <div class="absolute -top-2 -left-2 w-3 h-3 bg-blue-300 rounded-full opacity-60 animate-pulse"></div>
          <div class="absolute -top-1 -right-3 w-2 h-2 bg-green-300 rounded-full opacity-60 animate-pulse" style="animation-delay: 0.5s"></div>
          <div class="absolute top-0 right-0 w-2 h-2 bg-blue-200 rounded-full opacity-60 animate-pulse" style="animation-delay: 1s"></div>

          <!-- プログレスバーカード -->
          <div class="bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl p-5 border-2 border-green-300 shadow-lg">
            <div class="text-white text-sm mb-3 font-medium">
              汚部屋レベル: {{ dirtyRoomLevel }}% ({{ dirtyRoomMessage }})
            </div>

            <!-- プログレスバー -->
            <div class="bg-blue-900 rounded-full h-6 overflow-hidden relative">
              <div
                class="h-full rounded-full relative overflow-hidden transition-all duration-500"
                :style="{ width: `${dirtyRoomLevel}%` }"
              >
                <div class="absolute inset-0 bg-gradient-to-r from-green-400 via-green-500 to-blue-400"
                     style="background-size: 20px 100%; background-image: repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.1) 10px, rgba(255,255,255,0.1) 20px);">
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 分析前：撮影を促すカード -->
        <div v-if="!hasAnalysis" class="bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl p-6 shadow-lg">
          <div class="text-center text-white">
            <div class="text-4xl mb-3">&#x1F4F7;</div>
            <p class="text-lg font-bold mb-2">まずは部屋を撮影しよう！</p>
            <p class="text-sm opacity-80 mb-4">AIが最適な片付けプランを提案します</p>
            <button
              @click="goToCamera"
              class="w-full py-3 bg-white text-purple-600 rounded-xl font-bold shadow-md"
            >
              撮影を始める
            </button>
          </div>
        </div>

        <!-- 分析後：注目エリアカード -->
        <div v-if="hasAnalysis && selectedZone" class="bg-gradient-to-br from-teal-500 to-green-600 rounded-2xl overflow-hidden shadow-lg">
          <!-- 未来予想図のサムネイル（あれば） -->
          <div v-if="futureVisionUrl" class="relative h-32">
            <img :src="futureVisionUrl" alt="未来予想図" class="w-full h-full object-cover" />
            <div class="absolute inset-0 bg-gradient-to-t from-teal-600 to-transparent"></div>
            <div class="absolute bottom-2 left-4 text-white text-xs opacity-80">目指す姿</div>
          </div>

          <div class="p-5">
            <div class="flex items-center gap-2 mb-2">
              <span class="text-2xl">&#x1F3AF;</span>
              <span class="text-white text-sm font-medium opacity-90">今、集中すべきエリア</span>
            </div>
            <p class="text-white text-2xl font-bold mb-2">{{ selectedZone }}</p>
            <div v-if="estimatedTime" class="flex items-center gap-2 text-white text-sm opacity-80 mb-3">
              <span>&#x23F1;</span>
              <span>推定時間: {{ estimatedTime }}</span>
            </div>
          </div>
        </div>

        <!-- AIアドバイスカード -->
        <div v-if="hasAnalysis && zoneReason" class="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-5 border border-amber-200 shadow-sm">
          <div class="flex items-start gap-3">
            <div class="text-2xl flex-shrink-0">&#x1F4A1;</div>
            <div>
              <p class="text-amber-800 text-sm font-bold mb-1">なぜここからやるの？</p>
              <p class="text-amber-700 text-sm leading-relaxed">{{ zoneReason }}</p>
            </div>
          </div>
        </div>

        <!-- 現在のミッションカード -->
        <div v-if="hasAnalysis" class="bg-white rounded-2xl p-5 border-2 border-green-300 shadow-lg">
          <div class="text-gray-700 text-sm mb-3 font-medium">
            現在のミッション:
          </div>

          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3 flex-1">
              <span class="text-2xl">{{ currentMission.icon }}</span>
              <span class="text-gray-800 font-medium text-base">{{ currentMission.text }}</span>
            </div>

            <button
              @click="completeMission"
              class="bg-teal-500 hover:bg-teal-600 text-white rounded-xl px-6 py-3 font-bold text-sm shadow-md transition-colors flex items-center gap-2 flex-shrink-0"
            >
              <span class="text-lg">&#x2713;</span>
              <span>完了</span>
            </button>
          </div>
        </div>

        <!-- 次の予定リスト -->
        <div v-if="hasAnalysis && nextTasks.length > 0" class="mt-6">
          <h2 class="text-gray-800 font-bold text-lg mb-4">次の予定リスト</h2>

          <div class="space-y-3">
            <div
              v-for="(task, index) in nextTasks"
              :key="index"
              class="bg-white rounded-xl p-4 border border-gray-200 shadow-sm flex items-center justify-between"
            >
              <div class="flex items-center gap-3">
                <span class="text-xl">{{ task.icon }}</span>
                <span class="text-gray-700 font-medium">{{ task.text }}</span>
              </div>

              <div class="w-5 h-5 rounded-full border-2 border-gray-300 flex items-center justify-center">
                <span v-if="task.completed" class="text-green-500 text-xs">&#x2713;</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 再撮影ボタン（分析後） -->
        <div v-if="hasAnalysis" class="pt-4">
          <button
            @click="goToCamera"
            class="w-full py-3 bg-gray-100 text-gray-600 rounded-xl font-medium border border-gray-200"
          >
            &#x1F4F7; 部屋を再撮影する
          </button>
        </div>
      </div>

      <!-- ナビゲーションバー（フッター） -->
      <div class="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t-2 border-gray-200">
        <div class="flex justify-around items-center py-3">
          <!-- ホーム -->
          <button class="flex flex-col items-center gap-1">
            <div class="w-6 h-6 flex items-center justify-center">
              <svg class="w-6 h-6 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
              </svg>
            </div>
            <span class="text-xs text-green-500 font-medium">ホーム</span>
          </button>

          <!-- カメラ -->
          <button @click="goToCamera" class="flex flex-col items-center gap-1">
            <div class="w-6 h-6 flex items-center justify-center">
              <svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <span class="text-xs text-gray-400">カメラ</span>
          </button>

          <!-- 実績 -->
          <button class="flex flex-col items-center gap-1">
            <div class="w-6 h-6 flex items-center justify-center">
              <svg class="w-6 h-6 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            </div>
            <span class="text-xs text-gray-400">実績</span>
          </button>

          <!-- 設定 -->
          <button class="flex flex-col items-center gap-1">
            <div class="w-6 h-6 flex items-center justify-center">
              <svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <span class="text-xs text-gray-400">設定</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes pulse {
  0%, 100% {
    opacity: 0.6;
  }
  50% {
    opacity: 1;
  }
}

.animate-pulse {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
</style>
