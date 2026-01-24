/**
 * Claude API プロキシサーバー
 * フロントエンドからのリクエストを中継してCORS問題を回避
 * 
 * 【改善版】v2.0
 * - JSONモードによる分析精度向上
 * - 不変条件の強化（カメラ/照明/テクスチャ保護）
 * - temperature調整による安定化
 * - 品質キーワードの追加
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
  inspection: { count: 0, lastReset: new Date().toDateString() },
  retry: { count: 0, lastReset: new Date().toDateString() },
  dailyLimits: {
    flash: 50,  // Flash: 1日50回まで
    pro: 10,    // Pro: 1日10回まで（高コストなため）
    inspection: 100,  // 検品: 1日100回まで
    retry: 50,   // リトライ: 1日50回まで
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
    if (this.inspection.lastReset !== today) {
      this.inspection = { count: 0, lastReset: today }
      console.log('📊 検品使用回数をリセットしました')
    }
    if (this.retry.lastReset !== today) {
      this.retry = { count: 0, lastReset: today }
      console.log('📊 リトライ回数をリセットしました')
    }
  },

  // 使用可能かチェック
  canUse(model) {
    this.checkAndReset()
    const type = model === 'pro' ? 'pro' : model === 'inspection' ? 'inspection' : model === 'retry' ? 'retry' : 'flash'
    return this[type].count < this.dailyLimits[type]
  },

  // 使用回数をインクリメント
  increment(model) {
    this.checkAndReset()
    const type = model === 'pro' ? 'pro' : model === 'inspection' ? 'inspection' : model === 'retry' ? 'retry' : 'flash'
    this[type].count++
    console.log(`📊 ${type.toUpperCase()} 使用回数: ${this[type].count}/${this.dailyLimits[type]}`)
  },

  // 現在の使用状況を取得
  getStatus() {
    this.checkAndReset()
    return {
      flash: { used: this.flash.count, limit: this.dailyLimits.flash },
      pro: { used: this.pro.count, limit: this.dailyLimits.pro },
      inspection: { used: this.inspection.count, limit: this.dailyLimits.inspection },
      retry: { used: this.retry.count, limit: this.dailyLimits.retry },
    }
  }
}

// CORS設定（開発環境: すべてのオリジンを許可）
app.use(cors())

// JSON形式のデータ制限を 50MB に拡大
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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
// Gemini API エンドポイント（改善版）
// ============================================================

/**
 * 【改善1】JSONモード対応の分析プロンプト（座標取得機能付き）
 * 正規表現パースの失敗を防ぐ + 保護すべき物体の座標を取得
 */
const createAnalysisPrompt = () => `You are a professional room organizer AI. Analyze this photo and categorize EVERY visible item.

Your task is to classify all items into two categories:

【KEEP - 絶対に残す】
These items must NEVER be removed:
- 大型家具: テーブル、椅子、ソファ、ベッド、棚、本棚、デスク
- 家電製品: テレビ、冷蔵庫、電子レンジ、炊飯器、エアコン、照明器具
- キッチン設備: IHコンロ、ガスコンロ、シンク、換気扇、食器棚
- 固定設備: カーテン、ブラインド、時計、エアコン室内機
- 収納家具: クローゼット、チェスト、キャビネット

【REMOVE - 片付け対象】
These items should be cleaned up:
- 書類・紙類: 散らばった書類、雑誌、新聞、チラシ
- 小物: 文房具、おもちゃ、雑貨、アクセサリー
- 衣類: 脱ぎ捨てた服、バッグ、帽子、靴下
- 食器・飲料: コップ、皿、ペットボトル、空き缶、食べ残し
- ゴミ: ティッシュ、包装紙、空き箱、ビニール袋
- ケーブル: 乱雑に放置されたコード類

【IMPORTANT】
For each KEEP item, provide its bounding box coordinates as [ymin, xmin, ymax, xmax] where values are normalized (0.0-1.0).
These coordinates will be used to protect the objects from being altered during image generation.

【OUTPUT FORMAT】
You MUST respond with ONLY the following JSON. No explanation, no markdown, no extra text.

{
  "keep_items": [
    {
      "item": "アイテム名",
      "location": "場所",
      "reason": "残す理由",
      "bbox": [ymin, xmin, ymax, xmax]
    }
  ],
  "remove_items": [
    {"item": "アイテム名", "location": "場所", "reason": "消す理由"}
  ],
  "room_type": "kitchen/bedroom/living/office/other",
  "confidence": 0.0-1.0
}`

/**
 * 【改善2】強化された不変条件（物理法則レベルの保護）
 */
const createProtectionCommand = (roomType = 'general') => {
  const baseProtection = `
[IMMUTABLE LAWS - ABSOLUTELY DO NOT ALTER]

1. CAMERA & PERSPECTIVE
   - Keep the EXACT same camera angle and focal length
   - Maintain the original perspective and vanishing points
   - Do NOT change the viewpoint or crop

2. LIGHTING & SHADOWS
   - Preserve the original lighting direction and intensity
   - Keep all existing shadows in their original positions
   - Do NOT add new light sources or change ambient lighting

3. ARCHITECTURAL ELEMENTS
   - Walls, ceiling, and floor materials are PERMANENT
   - Windows, doors, and their frames cannot be moved or altered
   - Curtains, blinds, and window treatments stay as-is

4. TEXTURE PRESERVATION
   - Maintain the exact wood grain pattern of floors
   - Keep wall paint texture and color identical
   - Preserve carpet patterns and fabric textures

5. FIXED INSTALLATIONS
   - Kitchen appliances (stove, sink, refrigerator) are BOLTED DOWN
   - Built-in cabinets and shelving are PERMANENT
   - Ceiling lights and fixtures cannot be removed
`.trim()

  // 部屋タイプ別の追加保護
  const roomSpecificProtection = {
    kitchen: `
6. KITCHEN-SPECIFIC PROTECTION
   - IH cooktop / gas burners: MUST remain visible and unchanged
   - Range hood / ventilation: PERMANENT fixture
   - Sink and faucet: Cannot be altered
   - Counter surfaces: Keep original material and color`,

    bedroom: `
6. BEDROOM-SPECIFIC PROTECTION
   - Bed frame and headboard: PERMANENT
   - Closet doors and handles: Cannot be altered
   - Bedside tables: Keep in original position`,

    living: `
6. LIVING ROOM-SPECIFIC PROTECTION
   - Sofa and main seating: PERMANENT placement
   - TV and entertainment unit: Cannot be removed
   - Coffee table: Keep in original position`,

    office: `
6. OFFICE-SPECIFIC PROTECTION
   - Desk and chair: PERMANENT placement
   - Monitor and computer equipment: Keep as-is
   - Bookshelf: Cannot be removed`,

    general: ''
  }

  return baseProtection + (roomSpecificProtection[roomType] || '')
}

/**
 * 【改善3】品質向上キーワード
 */
const qualityKeywords = `
[OUTPUT QUALITY REQUIREMENTS]
- High-resolution photography quality (8K UHD)
- Realistic shadows with soft edges
- Natural indoor lighting preservation
- Professional architectural photography style
- No blur, no distortion, no artifacts
- Clean and sharp edges on all objects
- Photorealistic texture rendering
`.trim()

/**
 * 【改善4】編集プロンプト生成（温度とトーンを調整 + 座標保護）
 */
const createEditPrompt = (editType, removeList = [], roomType = 'general', protectedBoundaries = []) => {
  const protectionCommand = createProtectionCommand(roomType)

  // REMOVEリストをフォーマット
  const removeListText = removeList.length > 0
    ? removeList.map((item, i) => `${i + 1}. ${item}`).join('\n')
    : '(分析結果なし - 一般的な散らかりを除去)'

  // 座標保護情報をフォーマット
  const boundariesText = protectedBoundaries.length > 0
    ? `\n[PHYSICAL BOUNDARIES - DO NOT MODIFY THESE REGIONS]
These pixel regions contain essential furniture/appliances and must NOT be altered:
${protectedBoundaries.map((b, i) => `${i + 1}. ${b.item} at [${b.bbox.join(', ')}]`).join('\n')}

When editing, preserve these regions EXACTLY as they are. Only remove clutter around them.`
    : ''

  if (editType === 'future_vision') {
    // 通常モード: バランスの取れた編集
    return `${protectionCommand}${boundariesText}

[MISSION] Professionally organize this room by removing clutter.

[ITEMS TO REMOVE]
${removeListText}

[EDITING RULES]
1. Remove ONLY the items listed above
2. Where items are removed, RECONSTRUCT the background using surrounding textures
3. Do NOT add any new objects, decorations, or furniture
4. Keep the room's original character and atmosphere

[TECHNIQUE]
- Use content-aware fill to restore hidden surfaces
- Match floor/wall textures seamlessly
- Maintain consistent lighting across edited areas

${qualityKeywords}

Generate the cleaned version of this room.`
  }

  if (editType === 'future_vision_stronger') {
    // 強化モード: より徹底的だが制御された編集
    return `${protectionCommand}${boundariesText}

[MISSION] Deep clean this room - remove ALL movable clutter while preserving the room's soul.

[PRIMARY TARGETS FOR REMOVAL]
${removeListText}

[ADDITIONAL CLEANUP]
- Clear ALL floor surfaces of loose items
- Remove items from table/desk surfaces (keep only essential electronics)
- Clean up visible cable clutter
- Remove any items that appear out of place

[STRICT PROHIBITIONS]
- NEVER remove large furniture (tables, chairs, sofas, beds)
- NEVER remove kitchen appliances (stove, refrigerator, microwave)
- NEVER add vases, plants, flowers, or decorations
- NEVER change wall colors or floor materials
- NEVER alter the room layout or furniture positions

[RECONSTRUCTION TECHNIQUE]
- Where clutter is removed, seamlessly restore the underlying surface
- Use the surrounding floor/table texture to fill gaps
- Ensure no "ghost shadows" or artifacts remain

${qualityKeywords}

Create a professionally organized version that looks like the same room, just tidied up.`
  }

  // デフォルト
  return `${protectionCommand}${boundariesText}

[MISSION] Light cleanup of this room.

[ITEMS TO REMOVE]
${removeListText}

[RULES]
- Remove only obvious clutter
- Keep all furniture and appliances
- Do not add anything new

${qualityKeywords}`
}

/**
 * 【新機能】検品フェーズ（Self-Critic）
 * 生成画像が基準を満たしているかをチェック
 */
const inspectGeneratedImage = async (originalBase64, generatedBase64, roomType) => {
  const inspectionPrompt = `You are a quality control inspector for AI-generated cleaned room images.

Compare these TWO images:
1. ORIGINAL image (the messy room)
2. GENERATED image (the cleaned version)

Check the following criteria strictly:

【CRITERION 1: STRUCTURAL INTEGRITY】
- Are all major furniture items (tables, chairs, sofas, beds, shelves) still in the SAME position?
- Are kitchen appliances (IH cooktop, stove, sink, faucet) still visible and unchanged?
- Are walls, windows, and doors preserved correctly?
- Is the camera angle and perspective EXACTLY the same?

【CRITERION 2: CLEANUP EFFECTIVENESS】
- Is the generated image DRAMATICALLY cleaner than the original?
- Are floor surfaces cleared of clutter?
- Are table/desk surfaces tidied up?
- Does it look like a "before and after" transformation?
- Is the change VISIBLE and SIGNIFICANT (not just minor adjustments)?

【OUTPUT FORMAT - JSON only】
{
  "verdict": "PASS or FAIL",
  "structural_integrity": {
    "score": 0-10,
    "issues": ["list any problems found, or empty array if none"]
  },
  "cleanup_effectiveness": {
    "score": 0-10,
    "issues": ["list any problems found, or empty array if none"]
  },
  "overall_reason": "brief explanation of the verdict",
  "fix_instruction": "if FAIL, provide specific instructions to fix the issue in the next generation"
}

Scoring guide:
- 9-10: Excellent, meets all requirements
- 7-8: Good, minor issues
- 5-6: Acceptable, some concerns
- 0-4: Poor, major problems

Verdict guide:
- PASS: Both scores >= 7
- FAIL: Any score < 7`

  try {
    const response = await fetch(
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
                { text: inspectionPrompt },
                {
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: originalBase64,
                  },
                },
                {
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: generatedBase64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,  // 検品は厳格に
            maxOutputTokens: 1024,
            responseMimeType: 'application/json',
          },
        }),
      }
    )

    if (!response.ok) {
      console.log('⚠️ 検品API呼び出し失敗')
      return null
    }

    const data = await response.json()
    const inspectionText = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

    try {
      const inspectionResult = JSON.parse(inspectionText)
      console.log('\n🔍 === 検品結果 ===')
      console.log('判定:', inspectionResult.verdict)
      console.log('構造整合性:', inspectionResult.structural_integrity.score)
      console.log('片付け効果:', inspectionResult.cleanup_effectiveness.score)
      console.log('理由:', inspectionResult.overall_reason)

      if (inspectionResult.verdict === 'FAIL') {
        console.log('❌ 修正指示:', inspectionResult.fix_instruction)
      }

      return inspectionResult
    } catch (parseError) {
      console.log('⚠️ 検品結果のJSONパースエラー')
      return null
    }
  } catch (error) {
    console.log('⚠️ 検品処理エラー:', error.message)
    return null
  }
}

/**
 * Gemini で画像を編集（改善版 + 検品 + リトライ機能）
 */
app.post('/api/gemini/edit-image', async (req, res) => {
  try {
    const { imageBase64, editType, highQuality } = req.body

    if (!imageBase64) {
      return res.status(400).json({ error: '画像データが必要です' })
    }

    // モデル選択
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

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')

    // ============================================================
    // 【改善】JSONモードによる現状分析
    // ============================================================
    console.log('\n🔍 === AI現状分析開始（JSONモード） ===')

    let removeList = []
    let roomType = 'general'
    let protectedBoundaries = []

    try {
      const analysisPrompt = createAnalysisPrompt()

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
              temperature: 0.1,  // 分析は低温度で正確に
              maxOutputTokens: 2048,
              // JSONモードを強制
              responseMimeType: 'application/json',
            },
          }),
        }
      )

      if (analysisResponse.ok) {
        const analysisData = await analysisResponse.json()
        const analysisText = analysisData.candidates?.[0]?.content?.parts?.[0]?.text || ''

        console.log('\n📋 分析結果（JSON）:')
        console.log(analysisText)

        try {
          // JSONをパース
          const analysisJson = JSON.parse(analysisText)

          // REMOVEリストを構築
          if (analysisJson.remove_items && Array.isArray(analysisJson.remove_items)) {
            removeList = analysisJson.remove_items.map(item =>
              `${item.location}の${item.item}`
            )
          }

          // 保護境界（座標）を取得
          if (analysisJson.keep_items && Array.isArray(analysisJson.keep_items)) {
            protectedBoundaries = analysisJson.keep_items
              .filter(item => item.bbox && Array.isArray(item.bbox) && item.bbox.length === 4)
              .map(item => ({
                item: item.item,
                bbox: item.bbox
              }))
          }

          // 部屋タイプを取得
          if (analysisJson.room_type) {
            roomType = analysisJson.room_type
          }

          console.log('✅ JSONパース成功')
          console.log('🏠 部屋タイプ:', roomType)
          console.log('🗑️ REMOVEリスト:', removeList)
          console.log('🛡️ 保護境界:', protectedBoundaries.length, '個')

        } catch (parseError) {
          console.log('⚠️ JSONパースエラー、フォールバック処理:', parseError.message)
          // フォールバック: テキストから抽出を試みる
          const itemMatches = analysisText.matchAll(/"item":\s*"([^"]+)"/g)
          for (const match of itemMatches) {
            removeList.push(match[1])
          }
        }
      } else {
        console.log('⚠️ 分析API呼び出し失敗、デフォルト設定で続行')
      }
    } catch (analysisError) {
      console.log('⚠️ 現状分析エラー（画像生成は続行）:', analysisError.message)
    }

    // ============================================================
    // 【改善】画像生成関数（リトライ対応）
    // ============================================================

    const generateImage = async (fixInstruction = null, attemptNumber = 1) => {
      let editPrompt = createEditPrompt(editType, removeList, roomType, protectedBoundaries)

      // リトライ時は修正指示を先頭に追加
      if (fixInstruction) {
        editPrompt = `【FIX INSTRUCTION - CRITICAL】
The previous generation FAILED quality check. You MUST address this issue:
${fixInstruction}

DO NOT repeat the same mistake. Follow the instructions below carefully.

---

${editPrompt}`
      }

      // 【改善】temperature設定
      // - Proモデル: 低めに設定して安定性を確保
      // - Flashモデル: やや高めでも許容
      let temperature
      if (useProModel) {
        temperature = editType === 'future_vision_stronger' ? 0.4 : 0.3
      } else {
        temperature = editType === 'future_vision_stronger' ? 0.6 : 0.5
      }

      const modelName = useProModel
        ? 'gemini-2.0-flash-exp'
        : 'gemini-2.5-flash-image'

      console.log(`\n=== 画像編集リクエスト (試行 ${attemptNumber}) ===`)
      console.log('モデル:', modelName, useProModel ? '(Pro/高画質)' : '(Flash/通常)')
      console.log('editType:', editType)
      console.log('temperature:', temperature)
      console.log('roomType:', roomType)
      console.log('removeList件数:', removeList.length)
      console.log('保護境界件数:', protectedBoundaries.length)
      console.log('プロンプト長:', editPrompt.length, '文字')
      if (fixInstruction) {
        console.log('🔧 修正指示あり:', fixInstruction.substring(0, 100))
      }

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

      return response
    }

    // 初回生成
    let response = await generateImage(null, 1)

    if (!response.ok) {
      const errorData = await response.json()
      console.error('Gemini API エラー:', errorData)

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

    // デバッグ出力
    console.log('\n=== Gemini レスポンス (初回) ===')
    if (data.candidates && data.candidates[0]) {
      const parts = data.candidates[0].content?.parts || []
      console.log('parts数:', parts.length)
      parts.forEach((part, i) => {
        if (part.text) {
          console.log(`part[${i}] テキスト:`, part.text.substring(0, 100))
        }
        if (part.inlineData) {
          console.log(`part[${i}] 画像:`, part.inlineData.mimeType)
        }
      })
    }

    // 画像データを抽出
    let generatedImageBase64 = null
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      const parts = data.candidates[0].content.parts
      for (const part of parts) {
        if (part.inlineData && part.inlineData.mimeType?.startsWith('image/')) {
          generatedImageBase64 = part.inlineData.data
          console.log('✅ 画像データ抽出成功')
          break
        }
      }
    }

    if (!generatedImageBase64) {
      console.log('❌ 画像が生成されませんでした')
      const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text
      if (textResponse) {
        console.log('テキストレスポンス:', textResponse.substring(0, 300))
      }
      return res.status(500).json({
        error: '画像の生成に失敗しました。AIがテキストのみを返しました。',
        aiResponse: textResponse?.substring(0, 200)
      })
    }

    // 成功時に使用回数をインクリメント（初回）
    usageTracker.increment(modelType)

    // ============================================================
    // 【新機能】検品フェーズ + リトライロジック
    // ============================================================
    let inspectionResult = null
    let didRetry = false
    let finalImageBase64 = generatedImageBase64

    // 検品実行
    if (usageTracker.canUse('inspection')) {
      inspectionResult = await inspectGeneratedImage(base64Data, generatedImageBase64, roomType)

      if (inspectionResult) {
        usageTracker.increment('inspection')

        // FAIL判定の場合、リトライを実行
        if (inspectionResult.verdict === 'FAIL' && usageTracker.canUse('retry')) {
          console.log('\n🔄 === リトライ開始 ===')
          console.log('理由:', inspectionResult.overall_reason)

          const retryResponse = await generateImage(inspectionResult.fix_instruction, 2)

          if (retryResponse.ok) {
            const retryData = await retryResponse.json()

            console.log('\n=== Gemini レスポンス (リトライ) ===')
            if (retryData.candidates && retryData.candidates[0]) {
              const parts = retryData.candidates[0].content?.parts || []
              console.log('parts数:', parts.length)
            }

            // リトライ画像を抽出
            let retryImageBase64 = null
            if (retryData.candidates && retryData.candidates[0] && retryData.candidates[0].content) {
              const parts = retryData.candidates[0].content.parts
              for (const part of parts) {
                if (part.inlineData && part.inlineData.mimeType?.startsWith('image/')) {
                  retryImageBase64 = part.inlineData.data
                  console.log('✅ リトライ画像データ抽出成功')
                  break
                }
              }
            }

            if (retryImageBase64) {
              // リトライ成功：使用回数をカウント
              usageTracker.increment('retry')
              usageTracker.increment(modelType)  // 生成モデルも再度カウント

              // 再検品（オプション：リトライ結果も検品する）
              if (usageTracker.canUse('inspection')) {
                const retryInspection = await inspectGeneratedImage(base64Data, retryImageBase64, roomType)
                if (retryInspection) {
                  usageTracker.increment('inspection')
                  inspectionResult = retryInspection
                  console.log('✅ リトライ後の検品完了:', retryInspection.verdict)
                }
              }

              finalImageBase64 = retryImageBase64
              didRetry = true
              console.log('✅ リトライ画像を最終結果として採用')
            } else {
              console.log('⚠️ リトライで画像生成失敗、初回画像を使用')
            }
          } else {
            console.log('⚠️ リトライAPI呼び出し失敗、初回画像を使用')
          }
        } else if (inspectionResult.verdict === 'PASS') {
          console.log('✅ 検品PASS - そのまま返却')
        }
      }
    } else {
      console.log('⚠️ 検品の使用回数上限に達したため、検品をスキップ')
    }

    res.json({
      success: true,
      imageBase64: finalImageBase64,
      imageUrl: `data:image/png;base64,${finalImageBase64}`,
      model: useProModel ? 'gemini-2.0-flash-exp' : 'gemini-2.5-flash-image',
      usage: usageTracker.getStatus(),
      debug: {
        roomType,
        removeItemCount: removeList.length,
        protectedBoundariesCount: protectedBoundaries.length,
        temperature: useProModel
          ? (editType === 'future_vision_stronger' ? 0.4 : 0.3)
          : (editType === 'future_vision_stronger' ? 0.6 : 0.5),
        inspectionResult: inspectionResult || { message: '検品未実施' },
        didRetry,
      }
    })
  } catch (error) {
    console.error('Gemini サーバーエラー:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * Gemini Inpainting エンドポイント
 */
app.post('/api/gemini/inpaint', async (req, res) => {
  try {
    const { imageBase64, maskBase64, editType } = req.body

    if (!imageBase64) {
      return res.status(400).json({ error: '画像データが必要です' })
    }

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')

    const inpaintPrompt = `Clean up this room. Remove all clutter and mess from the floor and surfaces. Keep furniture in place. Restore the original floor and wall textures where items are removed.`

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
                { text: inpaintPrompt },
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
            temperature: 0.3,
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
        if (part.inlineData && part.inlineData.mimeType?.startsWith('image/')) {
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

// レガシーエンドポイント（後方互換性）
app.post('/api/generate-image', async (req, res) => {
  req.body.editType = 'future_vision'
  return res.redirect(307, '/api/gemini/edit-image')
})

// ============================================================
// 片付け場所分析エンドポイント
// ============================================================
app.post('/api/analyze-cleanup-spots', async (req, res) => {
  try {
    const { imageBase64 } = req.body

    if (!imageBase64) {
      return res.status(400).json({ error: '画像データが必要です' })
    }

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')

    const systemInstruction = `You are the world's best professional cleaning advisor and room organization expert.
あなたは世界最高のプロ清掃アドバイザーであり、部屋整理の専門家です。

【YOUR EXPERTISE】
- 20年以上の片付けコンサルティング経験
- 心理学に基づく「やる気を引き出す」アドバイス
- 日本の住環境に精通

【YOUR PERSONALITY】
- 温かく励ます口調
- 具体的で実行しやすいアドバイス
- 小さな成功体験を大切にする`

    const analyzePrompt = `【TASK】Analyze this room and identify cleanup spots.

【OUTPUT FORMAT - JSON only, no extra text】
{
  "spots": [
    {
      "location": "場所名",
      "items": "散らかっているもの",
      "action": "具体的なアクション",
      "priority": "high/medium/low",
      "estimatedTime": "推定時間"
    }
  ],
  "totalEstimatedTime": "全体時間",
  "encouragement": "励ましの言葉"
}

【PRIORITY】
- high: 2分以内
- medium: 5分程度
- low: 10分以上`

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${process.env.VITE_GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemInstruction }]
          },
          contents: [
            {
              parts: [
                { text: analyzePrompt },
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
            temperature: 0.3,
            topP: 0.9,
            topK: 32,
            responseMimeType: 'application/json',
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

    let analysisResult = null
    try {
      analysisResult = JSON.parse(analysisText)
    } catch (parseError) {
      console.error('JSON パースエラー:', parseError)
      const jsonMatch = analysisText.match(/\{[\s\S]*"spots"[\s\S]*\}/)
      if (jsonMatch) {
        analysisResult = JSON.parse(jsonMatch[0])
      }
    }

    if (!analysisResult) {
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
  res.json({ status: 'ok', version: '2.0' })
})

// 使用状況取得
app.get('/api/usage', (req, res) => {
  res.json({
    success: true,
    usage: usageTracker.getStatus(),
  })
})

app.listen(PORT, () => {
  console.log(`🚀 プロキシサーバー v3.0 起動: http://localhost:${PORT}`)
  console.log('改善点:')
  console.log('  ✅ JSONモードによる分析精度向上')
  console.log('  ✅ 不変条件の強化（カメラ/照明/テクスチャ保護）')
  console.log('  ✅ temperature調整（Pro: 0.3-0.4, Flash: 0.5-0.6）')
  console.log('  ✅ 品質キーワード追加')
  console.log('\n【v3.0 新機能】')
  console.log('  🔍 高度な検品フェーズ（Self-Critic）')
  console.log('  🔄 インテリジェントリトライ（FAIL時自動再生成）')
  console.log('  🛡️ 座標指定による物体保護（Bounding Box）')
  console.log('  📊 検品・リトライのAPI使用回数トラッキング')
})
