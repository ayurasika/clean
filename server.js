/**
 * Claude API プロキシサーバー
 * フロントエンドからのリクエストを中継してCORS問題を回避
 */

import express from 'express'
import cors from 'cors'
import fetch from 'node-fetch'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

// ============================================================
// 生成回数カウント管理（コスト管理用）
// ============================================================
const usageTracker = {
  flash: { count: 0, lastReset: new Date().toDateString() },
  pro: { count: 0, lastReset: new Date().toDateString() },
  dailyLimits: {
    flash: 50,  // Flash: 1日50回まで
    pro: 10,    // Pro: 1日10回まで（高コストなため）
  },

  // 日付が変わったらリセット
  checkAndReset() {
    const today = new Date().toDateString()
    if (this.flash.lastReset !== today) {
      this.flash = { count: 0, lastReset: today }
      console.log('📊 Flash使用回数をリセットしました')
    }
    if (this.pro.lastReset !== today) {
      this.pro = { count: 0, lastReset: today }
      console.log('📊 Pro使用回数をリセットしました')
    }
  },

  // 使用可能かチェック
  canUse(model) {
    this.checkAndReset()
    const type = model === 'pro' ? 'pro' : 'flash'
    return this[type].count < this.dailyLimits[type]
  },

  // 使用回数をインクリメント
  increment(model) {
    this.checkAndReset()
    const type = model === 'pro' ? 'pro' : 'flash'
    this[type].count++
    console.log(`📊 ${type.toUpperCase()} 使用回数: ${this[type].count}/${this.dailyLimits[type]}`)
  },

  // 現在の使用状況を取得
  getStatus() {
    this.checkAndReset()
    return {
      flash: { used: this.flash.count, limit: this.dailyLimits.flash },
      pro: { used: this.pro.count, limit: this.dailyLimits.pro },
    }
  }
}

// CORS設定
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  methods: ['POST', 'GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}))

app.use(express.json({ limit: '10mb' }))

// Claude API プロキシエンドポイント
app.post('/api/analyze', async (req, res) => {
  try {
    const { imageBase64 } = req.body

    if (!imageBase64) {
      return res.status(400).json({ error: '画像データが必要です' })
    }

    // Base64データからプレフィックスを除去
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.VITE_CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: base64Data,
                },
              },
              {
                type: 'text',
                text: `あなたは「片付けの司令塔AI」です。この部屋の写真を戦略的に分析してください。

## 分析のステップ

### STEP 1: ゾーニング分析
部屋を以下のようなエリア（ゾーン）に分けて認識してください：
- デスク周り
- ベッド周り
- 床・通路
- クローゼット・収納
- 本棚・シェルフ
- キッチン周り
- その他

### STEP 2: 戦略的エリア選定
認識したエリアの中から、**最も短時間で達成感が出て、片付けのハードルが低いエリア**を1つだけ選んでください。

選定基準：
1. 5〜15分で目に見える成果が出せる
2. 精神的・肉体的負担が少ない
3. 片付けると他のエリアにも良い影響を与える
4. 「やった！」という達成感を得やすい

### STEP 3: 具体的タスクの提案
選んだエリアに特化した、具体的で実行可能なタスクを3つ提案してください。
各タスクは「〇〇を△△する」という明確な形式で書いてください。

## 出力形式

まず、分析コメントを2〜3文で書いてください。

次に、必ず以下のJSON形式で出力してください：
{
  "dirtyLevel": 0-100の数値,
  "selectedZone": "選んだエリア名",
  "reason": "なぜこのエリアから始めるべきか（ユーザーを励ます温かい言葉で）",
  "tasks": ["タスク1", "タスク2", "タスク3"],
  "estimatedTime": "推定所要時間（例：10分）",
  "zones": ["認識した全エリアのリスト"]
}`,
              },
            ],
          },
        ],
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.error('Claude API エラー:', errorData)
      return res.status(response.status).json({
        error: errorData.error?.message || 'Claude API エラー',
      })
    }

    const data = await response.json()
    res.json({
      success: true,
      analysis: data.content[0].text,
      rawResponse: data,
    })
  } catch (error) {
    console.error('サーバーエラー:', error)
    res.status(500).json({ error: error.message })
  }
})

// ============================================================
// Gemini API エンドポイント（Imagen 3 / Gemini 2.0 Flash）
// Image-to-Image 変換で元の部屋の構造を維持しながら編集
// ============================================================

/**
 * Gemini で画像を編集（未来予想図生成）
 * ハイブリッド構成:
 * - 基本: gemini-2.5-flash-image（高速・低コスト）
 * - 高画質モード: gemini-2.0-flash-exp（高品質・高コスト）
 */
app.post('/api/gemini/edit-image', async (req, res) => {
  try {
    const { imageBase64, editType, highQuality } = req.body

    if (!imageBase64) {
      return res.status(400).json({ error: '画像データが必要です' })
    }

    // モデル選択（高画質モードかどうか）
    const useProModel = highQuality === true
    const modelType = useProModel ? 'pro' : 'flash'

    // 使用回数チェック
    if (!usageTracker.canUse(modelType)) {
      const status = usageTracker.getStatus()
      return res.status(429).json({
        error: `本日の${useProModel ? '高画質モード' : '通常モード'}の使用回数上限に達しました`,
        usage: status,
        suggestion: useProModel ? '通常モードをお試しください' : '明日またお試しください'
      })
    }

    // Base64データからプレフィックスを除去
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')

    // 日英ハイブリッドプロンプト（より効果的な指示）
    let editPrompt = ''
    let temperature = 0.5 // デフォルト: 少し大胆に

    if (editType === 'future_vision') {
      // 通常の片付け: 温度を最大に設定（大胆な編集）
      temperature = 1.0
      editPrompt = `REMOVE ALL CLUTTER. ERASE everything that is not furniture.

床の物 → 消す
テーブルの上の物 → 消す
散らかった書類 → 消す
服や衣類 → 消す
小物・雑貨 → 消す
ペットボトル・食器 → 消す

KEEP: 壁、床、大型家具（テーブル、椅子、棚）のみ
DELETE: それ以外の全てのアイテム

DO NOT add anything new. Only remove.`
    } else if (editType === 'future_vision_stronger') {
      // 「もっと綺麗に」: 温度高め（より大胆な変換）
      temperature = 0.7
      editPrompt = `【ROLE】You are an EXTREME minimalist room transformation expert.
あなたは究極のミニマリスト部屋変換専門家です。

【MISSION】Make this room ULTRA CLEAN - remove EVERYTHING possible.
この部屋を究極に綺麗に - 可能な限りすべてを消去してください。

【AGGRESSIVE CLEANING RULES - 徹底清掃ルール】
1. 床: Remove 100% of items on floor（床の物を100%消去）
2. 棚・テーブル: Clear ALL surfaces completely（すべての面を完全にクリア）
3. 背景: Clean background shelves and walls（背景の棚や壁も綺麗に）
4. 隅々: Check corners and hidden areas（隅や隠れた場所もチェック）

【STRICT PROHIBITION - 厳禁】
- NO vases, NO flowers, NO plants（花瓶・花・植物禁止）
- NO decorations, NO new furniture（装飾品・新家具禁止）
- ONLY REMOVE, never add（消すだけ、絶対に追加しない）

【GOAL】Minimalist empty room - モデルルームのような何もない状態`
    } else if (editType === 'organize') {
      temperature = 0.5
      editPrompt = `Remove ALL items from the ENTIRE room - floors, tables, shelves, cabinets, background areas. Leave everything EMPTY. DO NOT add decorations. Maintain perspective.`
    } else {
      temperature = 0.5
      editPrompt = `Clean the ENTIRE room by removing ALL items from ALL surfaces including background shelves. DO NOT add anything. Leave empty.`
    }

    // ============================================================
    // デバッグ: 画像生成の前にAIによる現状分析を実行
    // ============================================================
    console.log('\n🔍 === AI現状分析開始 ===')

    try {
      const analysisPrompt = `You are a professional room organizer. Analyze this photo and categorize EVERY visible item.

【TASK】Classify ALL items into two categories:

=== CATEGORY A: 絶対に残す（KEEP - Do NOT remove） ===
Major furniture and appliances that are essential:
- 大型家具: テーブル、椅子、ソファ、ベッド、棚、本棚
- 家電: テレビ、冷蔵庫、電子レンジ、炊飯器、エアコン、照明
- 固定設備: カーテン、時計、カレンダー

=== CATEGORY B: 片付け対象（REMOVE - Should be cleaned up） ===
Clutter and misplaced items:
- 書類・紙類: 散らばった書類、本、ノート
- 小物: 文房具、おもちゃ、雑貨
- 衣類: 脱ぎ捨てた服、バッグ、帽子
- 食器類: コップ、皿、ペットボトル
- ゴミ: ティッシュ、包装紙、空き箱
- ケーブル類: 乱雑なコード

【OUTPUT FORMAT - 日本語で出力】

■ 残すべき物（KEEP）:
1. [場所]: [物] - 理由: [なぜ残すか]
2. ...

■ 片付けるべき物（REMOVE）:
1. [場所]: [物] - 理由: [なぜ消すか]
2. ...

■ 判断に迷う物（UNCERTAIN）:
1. [場所]: [物] - 理由: [なぜ迷うか]

Be thorough. List EVERY visible item in one of these categories.`

      const analysisResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.VITE_GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: analysisPrompt },
                  {
                    inlineData: {
                      mimeType: 'image/jpeg',
                      data: base64Data,
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 1024,
            },
          }),
        }
      )

      // 分析結果からREMOVEリストを抽出
      let removeList = []

      if (analysisResponse.ok) {
        const analysisData = await analysisResponse.json()
        const analysisText = analysisData.candidates?.[0]?.content?.parts?.[0]?.text || '(分析結果なし)'

        console.log('\n🔍 --- AI片付け対象認識リスト ---')
        console.log(analysisText)
        console.log('--- 認識リスト終了 ---\n')

        // REMOVEセクションから項目を抽出
        const removeMatch = analysisText.match(/■ 片付けるべき物（REMOVE）:([\s\S]*?)(?=■|$)/)
        if (removeMatch) {
          const removeSection = removeMatch[1]
          // 各行から「場所: 物」を抽出
          const itemMatches = removeSection.matchAll(/\d+\.\s*([^:：]+)[:\：]\s*([^-\n]+)/g)
          for (const match of itemMatches) {
            const location = match[1].trim()
            const item = match[2].trim()
            removeList.push(`${location}の${item}`)
          }
        }

        console.log('🗑️ 抽出されたREMOVEリスト:', removeList)
      } else {
        const errorData = await analysisResponse.json().catch(() => ({}))
        console.log('⚠️ 現状分析APIエラー（画像生成は続行）')
        console.log('ステータス:', analysisResponse.status)
        console.log('エラー詳細:', JSON.stringify(errorData, null, 2))
      }

      // 分析結果をプロンプトの最初に追加（より強調）
      if (removeList.length > 0) {
        const removeListText = removeList.map((item, i) => `❌ ${item} → DELETE`).join('\n')
        // プロンプトの最初に追加（先頭に持ってくる）

        // 【ここを追加】Proモデルの暴走を防ぐための強力な保護命令（英語）
        const protectionCommand = `
[CRITICAL INSTRUCTION: PRESERVE STRUCTURE]
1. PRESERVE ARCHITECTURE: You MUST keep all permanent architectural elements EXACTLY as they are, including walls, floors, ceilings, windows, and their treatments (curtains, blinds).
2. KEEP BUILT-INS & FIXTURES: Do NOT remove or alter any built-in furniture or kitchen fixtures. 
   - Specifically, KEEP the kitchen stovetop (IH/gas burners), sink faucets, and ventilation hoods.
3. SELECTIVE REMOVAL: Only remove the specific movable items listed in the "MANDATORY DELETION LIST" below.
`.trim();

        // 保護命令の後に、削除リストを追加
        editPrompt = `${protectionCommand}

🚨 MANDATORY DELETION LIST 🚨
以下を必ず画像から消去せよ:
${removeListText}

---
${editPrompt}`
        console.log('📝 プロンプトの先頭にREMOVEリストを追加しました')
        console.log('📝 追加されたアイテム数:', removeList.length)
      }
    } catch (analysisError) {
      console.log('⚠️ 現状分析エラー（画像生成は続行）:', analysisError.message)
    }

    // ============================================================
    // Gemini API で画像生成（ハイブリッド構成）
    // ============================================================

    // モデル選択
    // - Flash: gemini-2.5-flash-image（高速・低コスト）
    // - Pro: gemini-2.0-flash-exp（高品質・REMOVEリスト対応が優秀）
    const modelName = useProModel
      ? 'gemini-2.0-flash-exp'
      : 'gemini-2.5-flash-image'

    console.log('=== 画像編集リクエスト ===')
    console.log('モデル:', modelName, useProModel ? '(高画質モード)' : '(通常モード)')
    console.log('editType:', editType)
    console.log('temperature:', temperature)
    console.log('最終プロンプト:', editPrompt.substring(0, 500) + '...')

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${process.env.VITE_GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: editPrompt,
                },
                {
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: base64Data,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            responseModalities: ['Image', 'Text'],
            temperature: temperature,
          },
        }),
      }
    )

    if (!response.ok) {
      const errorData = await response.json()
      console.error('Gemini API エラー:', errorData)

      // クォータエラーの場合、少し待ってリトライを促す
      if (response.status === 429) {
        return res.status(429).json({
          error: 'APIのレート制限に達しました。少し時間をおいてから再度お試しください。',
          retryAfter: 30
        })
      }

      return res.status(response.status).json({
        error: errorData.error?.message || 'Gemini API エラー',
      })
    }

    const data = await response.json()

    // デバッグ: レスポンス構造を詳細に出力
    console.log('=== Gemini レスポンス詳細 ===')
    console.log('candidates存在:', !!data.candidates)
    if (data.candidates && data.candidates[0]) {
      console.log('content存在:', !!data.candidates[0].content)
      if (data.candidates[0].content && data.candidates[0].content.parts) {
        console.log('parts数:', data.candidates[0].content.parts.length)
        data.candidates[0].content.parts.forEach((part, i) => {
          console.log(`part[${i}] keys:`, Object.keys(part))
          if (part.text) {
            console.log(`part[${i}] text (最初の200文字):`, part.text.substring(0, 200))
          }
          if (part.inlineData) {
            console.log(`part[${i}] inlineData.mimeType:`, part.inlineData.mimeType)
            console.log(`part[${i}] inlineData.data長さ:`, part.inlineData.data?.length || 0)
          }
        })
      }
    }
    console.log('=== レスポンス詳細終了 ===')

    // レスポンスから画像データを抽出
    let generatedImageBase64 = null
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      const parts = data.candidates[0].content.parts
      for (const part of parts) {
        if (part.inlineData && part.inlineData.mimeType && part.inlineData.mimeType.startsWith('image/')) {
          generatedImageBase64 = part.inlineData.data
          console.log('画像データ抽出成功! mimeType:', part.inlineData.mimeType)
          break
        }
      }
    }

    if (!generatedImageBase64) {
      console.log('画像が生成されませんでした。テキストのみのレスポンスの可能性があります。')
      // テキストレスポンスがある場合は表示
      if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
        console.log('テキストレスポンス:', data.candidates[0].content.parts[0].text.substring(0, 500))
      }
      return res.status(500).json({ error: '画像の生成に失敗しました。AIがテキストのみを返しました。' })
    }

    // 成功時に使用回数をインクリメント
    usageTracker.increment(modelType)

    res.json({
      success: true,
      imageBase64: generatedImageBase64,
      imageUrl: `data:image/png;base64,${generatedImageBase64}`,
      model: modelName,
      usage: usageTracker.getStatus(),
    })
  } catch (error) {
    console.error('Gemini サーバーエラー:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * Imagen 3 を使用した画像編集（フォールバック）
 */
async function handleImagen3Request(req, res, base64Data, editPrompt) {
  try {
    // Imagen 3 API を呼び出し
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${process.env.VITE_GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instances: [
            {
              prompt: editPrompt,
              image: {
                bytesBase64Encoded: base64Data,
              },
            },
          ],
          parameters: {
            sampleCount: 1,
            aspectRatio: '1:1',
            safetyFilterLevel: 'block_few',
            personGeneration: 'allow_adult',
          },
        }),
      }
    )

    if (!response.ok) {
      const errorData = await response.json()
      console.error('Imagen 3 API エラー:', errorData)
      return res.status(response.status).json({
        error: errorData.error?.message || 'Imagen 3 API エラー',
      })
    }

    const data = await response.json()

    if (data.predictions && data.predictions[0] && data.predictions[0].bytesBase64Encoded) {
      const generatedImageBase64 = data.predictions[0].bytesBase64Encoded
      res.json({
        success: true,
        imageBase64: generatedImageBase64,
        imageUrl: `data:image/jpeg;base64,${generatedImageBase64}`,
      })
    } else {
      res.status(500).json({ error: '画像の生成に失敗しました' })
    }
  } catch (error) {
    console.error('Imagen 3 エラー:', error)
    res.status(500).json({ error: error.message })
  }
}

/**
 * Gemini Inpainting エンドポイント
 * ゴミや散らかった物だけを消去して、元の床/壁のテクスチャで埋める
 */
app.post('/api/gemini/inpaint', async (req, res) => {
  try {
    const { imageBase64, maskBase64, editType } = req.body

    if (!imageBase64) {
      return res.status(400).json({ error: '画像データが必要です' })
    }

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')

    // Inpainting 用のプロンプト
    const inpaintPrompt = `Clean up this room. Remove all clutter and mess from the floor and surfaces. Keep furniture in place.`

    // Gemini 2.5 Flash Image API
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${process.env.VITE_GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: inpaintPrompt,
                },
                {
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: base64Data,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            responseModalities: ['Image', 'Text'],
          },
        }),
      }
    )

    if (!response.ok) {
      const errorData = await response.json()
      console.error('Gemini Inpainting API エラー:', errorData)
      return res.status(response.status).json({
        error: errorData.error?.message || 'Gemini Inpainting API エラー',
      })
    }

    const data = await response.json()

    let generatedImageBase64 = null
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      const parts = data.candidates[0].content.parts
      for (const part of parts) {
        if (part.inlineData && part.inlineData.mimeType && part.inlineData.mimeType.startsWith('image/')) {
          generatedImageBase64 = part.inlineData.data
          break
        }
      }
    }

    if (!generatedImageBase64) {
      return res.status(500).json({ error: 'Inpainting 画像の生成に失敗しました' })
    }

    res.json({
      success: true,
      imageBase64: generatedImageBase64,
      imageUrl: `data:image/png;base64,${generatedImageBase64}`,
    })
  } catch (error) {
    console.error('Gemini Inpainting サーバーエラー:', error)
    res.status(500).json({ error: error.message })
  }
})

// ============================================================
// レガシー: OpenAI 画像生成エンドポイント（後方互換性のため残す）
// ============================================================
app.post('/api/generate-image', async (req, res) => {
  // Gemini エンドポイントにリダイレクト
  req.body.editType = 'future_vision'
  return res.redirect(307, '/api/gemini/edit-image')
})

// ============================================================
// 片付け場所分析エンドポイント（Gemini で場所と行動を特定）
// ============================================================
app.post('/api/analyze-cleanup-spots', async (req, res) => {
  try {
    const { imageBase64 } = req.body

    if (!imageBase64) {
      return res.status(400).json({ error: '画像データが必要です' })
    }

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')

    // System Instruction: プロの清掃アドバイザーとしての役割定義
    const systemInstruction = `You are the world's best professional cleaning advisor and room organization expert.
あなたは世界最高のプロ清掃アドバイザーであり、部屋整理の専門家です。

【YOUR EXPERTISE - あなたの専門性】
- 20年以上の片付けコンサルティング経験
- 心理学に基づく「やる気を引き出す」アドバイス
- 日本の住環境に精通
- ミニマリズムと実用性のバランス感覚

【YOUR PERSONALITY - あなたの特徴】
- 温かく励ます口調
- 具体的で実行しやすいアドバイス
- 小さな成功体験を大切にする
- ユーザーのペースを尊重`

    // 片付け場所を特定するプロンプト（日英ハイブリッド）
    const analyzePrompt = `【TASK】Analyze this room photo and identify cleanup spots.
この部屋の写真を分析して、片付けが必要な場所を特定してください。

【ANALYSIS CRITERIA - 分析基準】
1. Quick wins first: すぐできて達成感が出る場所を優先
2. Visual impact: 見た目の変化が大きい場所を重視
3. Practical order: 実際に片付けやすい順序で提案

【OUTPUT FORMAT - 出力形式】
以下のJSON形式で出力してください（日本語で回答）：
{
  "spots": [
    {
      "location": "場所の名前（例：テーブルの上、床の左側）",
      "items": "散らかっているもの（具体的に）",
      "action": "具体的な片付けアクション（「〜を〜する」形式）",
      "priority": "high/medium/low",
      "estimatedTime": "推定時間（例：2分）"
    }
  ],
  "totalEstimatedTime": "全体の推定時間",
  "encouragement": "ユーザーを励ます温かい一言（やる気が出る言葉で！）"
}

【PRIORITY GUIDELINES - 優先度ガイドライン】
- high: 2分以内で完了、すぐ達成感が得られる
- medium: 5分程度、少し手間がかかる
- low: 10分以上、まとまった時間が必要

【IMPORTANT - 重要】
- 励ましメッセージは具体的で温かく（例：「テーブルの上から始めれば、5分後には気持ちいい空間が手に入りますよ！」）
- アクションは「〜を〜する」の形式で具体的に
- 3〜5個の spots を提案（多すぎると圧倒される）`

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${process.env.VITE_GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // System Instruction を設定
          systemInstruction: {
            parts: [{ text: systemInstruction }]
          },
          contents: [
            {
              parts: [
                {
                  text: analyzePrompt,
                },
                {
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: base64Data,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            // 分析は正確さを重視: temperature を下げる
            temperature: 0.3,
            topP: 0.9,
            topK: 32,
          },
        }),
      }
    )

    if (!response.ok) {
      const errorData = await response.json()
      console.error('Gemini 分析 API エラー:', errorData)
      return res.status(response.status).json({
        error: errorData.error?.message || 'Gemini API エラー',
      })
    }

    const data = await response.json()

    // テキストレスポンスを抽出
    let analysisText = ''
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      const parts = data.candidates[0].content.parts
      for (const part of parts) {
        if (part.text) {
          analysisText = part.text
          break
        }
      }
    }

    console.log('片付け分析レスポンス:', analysisText.substring(0, 500))

    // JSONを抽出
    let analysisResult = null
    try {
      // JSON部分を抽出（```json ... ``` または { ... } を探す）
      const jsonMatch = analysisText.match(/\{[\s\S]*"spots"[\s\S]*\}/)
      if (jsonMatch) {
        analysisResult = JSON.parse(jsonMatch[0])
      }
    } catch (parseError) {
      console.error('JSON パースエラー:', parseError)
    }

    if (!analysisResult) {
      // JSONパースに失敗した場合、テキストをそのまま返す
      return res.json({
        success: true,
        rawText: analysisText,
        spots: [],
      })
    }

    res.json({
      success: true,
      ...analysisResult,
    })
  } catch (error) {
    console.error('片付け分析サーバーエラー:', error)
    res.status(500).json({ error: error.message })
  }
})

// ヘルスチェック
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

// 使用状況取得エンドポイント
app.get('/api/usage', (req, res) => {
  res.json({
    success: true,
    usage: usageTracker.getStatus(),
  })
})

app.listen(PORT, () => {
  console.log(`プロキシサーバーが起動しました: http://localhost:${PORT}`)
})
