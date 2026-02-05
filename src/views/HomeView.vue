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

// 挨拶メッセージを時間帯で変更
const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return 'おはようございます'
  if (hour < 18) return 'こんにちは'
  return 'こんばんは'
})
</script>

<template>
  <div class="min-h-screen bg-cream font-light text-text-main">
    <!-- スマートフォン風のコンテナ -->
    <div class="max-w-md mx-auto min-h-screen relative overflow-hidden">

      <!-- ヘッダー -->
      <header class="flex items-center bg-cream/80 backdrop-blur-md sticky top-0 z-50 px-6 py-4 justify-between">
        <div class="flex size-10 items-center justify-center rounded-full bg-beige-soft soft-shadow">
          <svg class="w-5 h-5 text-text-main" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </div>
        <h2 class="text-text-main text-sm font-light leading-tight tracking-[0.15em] flex-1 text-center">かたづけナビ AI</h2>
        <div class="flex size-10 items-center justify-end">
          <button class="flex items-center justify-center rounded-full h-10 w-10 bg-beige-soft soft-shadow overflow-hidden">
            <svg class="w-5 h-5 text-text-main" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </button>
        </div>
      </header>

      <!-- メインコンテンツエリア -->
      <main class="px-6 pb-32">
        <!-- 挨拶 -->
        <div class="pt-8 pb-8 text-left">
          <p class="text-text-light text-xs tracking-widest mb-1 font-light uppercase">Welcome back</p>
          <h1 class="text-text-main text-3xl font-extralight leading-tight">{{ greeting }}</h1>
        </div>

        <!-- お部屋の散らかり具合カード（分析後のみ表示） -->
        <div v-if="hasAnalysis" class="bg-beige-soft p-8 rounded-3xl soft-shadow mb-8">
          <div class="flex justify-between items-end mb-4">
            <span class="text-text-main text-sm tracking-wide">お部屋の散らかり具合</span>
            <span class="text-sage-muted text-2xl font-light">{{ dirtyRoomLevel }}<span class="text-xs ml-0.5">%</span></span>
          </div>
          <div class="w-full h-3 progress-bar-bg rounded-full soft-inset relative overflow-hidden">
            <div
              class="absolute top-0 left-0 h-full bg-sage-muted rounded-full transition-all duration-500"
              :style="{ width: `${dirtyRoomLevel}%` }"
            ></div>
          </div>
          <p class="text-text-light text-[11px] mt-4 leading-relaxed font-light">
            {{ dirtyRoomMessage }}
          </p>
        </div>

        <!-- 分析前：撮影を促すカード -->
        <template v-if="!hasAnalysis">
          <h3 class="text-text-light text-[10px] tracking-[0.25em] mb-6 uppercase text-center">Get Started</h3>
          <div class="bg-white p-6 rounded-3xl soft-shadow border border-white/50 mb-10">
            <div class="flex gap-4 items-start mb-6">
              <div class="flex-1">
                <p class="text-text-main text-lg font-light mb-1">部屋を撮影しよう</p>
                <div class="flex items-center gap-1.5 text-text-light">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <p class="text-[11px] font-light">AIが最適なプランを提案</p>
                </div>
              </div>
              <div class="w-20 h-20 bg-beige-soft rounded-2xl soft-inset flex items-center justify-center">
                <svg class="w-10 h-10 text-sage-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            </div>
            <button
              @click="goToCamera"
              class="w-full py-4 rounded-full bg-sage-muted text-white text-xs tracking-[0.2em] font-light soft-shadow transition-transform active:scale-[0.98] uppercase"
            >
              撮影をはじめる
            </button>
          </div>
        </template>

        <!-- 分析後 -->
        <template v-if="hasAnalysis">
          <!-- Today's Focus -->
          <h3 class="text-text-light text-[10px] tracking-[0.25em] mb-6 uppercase text-center">Today's Focus</h3>

          <!-- 注目エリアカード -->
          <div v-if="selectedZone" class="bg-white p-6 rounded-3xl soft-shadow border border-white/50 mb-6 overflow-hidden">
            <!-- 未来予想図のサムネイル -->
            <div v-if="futureVisionUrl" class="relative h-32 -mx-6 -mt-6 mb-4">
              <img :src="futureVisionUrl" alt="未来予想図" class="w-full h-full object-cover" />
              <div class="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent"></div>
              <div class="absolute bottom-2 left-4 text-text-light text-[10px] tracking-widest uppercase">Goal Image</div>
            </div>

            <div class="flex gap-4 items-start mb-4">
              <div class="flex-1">
                <p class="text-text-light text-[10px] tracking-widest uppercase mb-1">Focus Area</p>
                <p class="text-text-main text-xl font-light mb-2">{{ selectedZone }}</p>
                <div v-if="estimatedTime" class="flex items-center gap-1.5 text-text-light">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p class="text-[11px] font-light">約 {{ estimatedTime }}</p>
                </div>
              </div>
            </div>
          </div>

          <!-- AIアドバイスカード -->
          <div v-if="zoneReason" class="bg-beige-soft/50 p-6 rounded-3xl border border-white/40 flex items-start gap-3 mb-6">
            <svg class="w-5 h-5 text-sage-muted flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <div>
              <p class="text-text-main text-xs font-normal mb-1">なぜここから？</p>
              <p class="text-text-light text-xs font-light leading-relaxed">{{ zoneReason }}</p>
            </div>
          </div>

          <!-- 現在のミッションカード -->
          <h3 class="text-text-light text-[10px] tracking-[0.25em] mb-4 uppercase text-center">Current Mission</h3>
          <div class="bg-white p-6 rounded-3xl soft-shadow border border-white/50 mb-6">
            <div class="flex gap-4 items-start mb-6">
              <div class="flex-1">
                <p class="text-text-main text-lg font-light mb-1">{{ currentMission.text }}</p>
                <div class="flex items-center gap-1.5 text-text-light">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p class="text-[11px] font-light">今すぐできるワーク</p>
                </div>
              </div>
              <div class="w-16 h-16 bg-beige-soft rounded-2xl soft-inset flex items-center justify-center text-2xl">
                {{ currentMission.icon }}
              </div>
            </div>
            <button
              @click="completeMission"
              class="w-full py-4 rounded-full bg-sage-muted text-white text-xs tracking-[0.2em] font-light soft-shadow transition-transform active:scale-[0.98] uppercase"
            >
              完了する
            </button>
          </div>

          <!-- 次の予定リスト -->
          <div v-if="nextTasks.length > 0">
            <h3 class="text-text-light text-[10px] tracking-[0.25em] mb-4 uppercase text-center">Up Next</h3>
            <div class="space-y-3 mb-6">
              <div
                v-for="(task, index) in nextTasks"
                :key="index"
                class="bg-beige-soft/50 rounded-2xl p-4 border border-white/40 flex items-center justify-between"
              >
                <div class="flex items-center gap-3">
                  <span class="text-xl">{{ task.icon }}</span>
                  <span class="text-text-main text-sm font-light">{{ task.text }}</span>
                </div>
                <div
                  class="w-5 h-5 rounded-full border flex items-center justify-center"
                  :class="task.completed ? 'bg-sage-muted border-sage-muted' : 'border-text-light/30'"
                >
                  <svg v-if="task.completed" class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          <!-- 再撮影ボタン -->
          <button
            @click="goToCamera"
            class="w-full py-3 rounded-full bg-beige-soft text-text-light text-xs tracking-[0.1em] font-light border border-white/40 transition-transform active:scale-[0.98]"
          >
            部屋を再撮影する
          </button>
        </template>

        <!-- 名言カード -->
        <div class="bg-beige-soft/50 p-6 rounded-3xl border border-white/40 flex flex-col items-center gap-3 mt-8">
          <svg class="w-5 h-5 text-sage-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
          <p class="text-text-light text-xs font-light text-center leading-relaxed">
            「一つ手に入れたら、一つ手放す」<br/>
            それが心地よい空間を保つための魔法です。
          </p>
        </div>
      </main>

      <!-- フローティングナビゲーションバー -->
      <nav class="fixed bottom-8 left-1/2 -translate-x-1/2 w-[85%] max-w-[340px] bg-white/70 backdrop-blur-xl border border-white/50 rounded-full px-4 py-3 flex items-center justify-around soft-shadow z-50">
        <button class="text-sage-muted flex flex-col items-center gap-0.5 p-2">
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
          </svg>
          <span class="text-[9px] font-light tracking-tighter uppercase">Home</span>
        </button>
        <button @click="goToCamera" class="text-text-light flex flex-col items-center gap-0.5 p-2">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span class="text-[9px] font-light tracking-tighter uppercase">Scan</span>
        </button>
        <button class="text-text-light flex flex-col items-center gap-0.5 p-2">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <span class="text-[9px] font-light tracking-tighter uppercase">Log</span>
        </button>
        <button class="text-text-light flex flex-col items-center gap-0.5 p-2">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span class="text-[9px] font-light tracking-tighter uppercase">Set</span>
        </button>
      </nav>
    </div>
  </div>
</template>

<style scoped>
/* カスタムカラー */
.bg-cream {
  background-color: #F9F7F2;
}
.bg-beige-soft {
  background-color: #F2EFE9;
}
.bg-sage-muted {
  background-color: #9EB3A2;
}
.bg-sage-light {
  background-color: #DCE3DE;
}
.text-text-main {
  color: #5C5852;
}
.text-text-light {
  color: #8E8A82;
}
.text-sage-muted {
  color: #9EB3A2;
}
.border-sage-muted {
  border-color: #9EB3A2;
}

/* ニューモーフィズム風シャドウ */
.soft-shadow {
  box-shadow: 4px 4px 12px rgba(0, 0, 0, 0.03), -4px -4px 12px rgba(255, 255, 255, 0.8);
}
.soft-inset {
  box-shadow: inset 2px 2px 5px rgba(0, 0, 0, 0.02), inset -2px -2px 5px rgba(255, 255, 255, 0.7);
}

/* プログレスバー背景 */
.progress-bar-bg {
  background: #EAE7E0;
}
</style>
