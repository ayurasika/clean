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
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

dotenv.config()

// ============================================================
// 環境変数・APIキーの検証（Gemini統一版）
// ============================================================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY

const validateApiKeys = () => {
  if (!GEMINI_API_KEY) {
    console.error('❌ 必須の環境変数が設定されていません:')
    console.error('   - VITE_GEMINI_API_KEY')
    console.error('')
    console.error('📝 .env ファイルに以下を追加してください:')
    console.error('   VITE_GEMINI_API_KEY=your_api_key_here')
    console.error('')

    if (process.env.NODE_ENV === 'production') {
      console.error('🚨 本番環境のため、サーバーを停止します')
      process.exit(1)
    } else {
      console.warn('⚠️  開発環境のため、サーバーは起動しますがAPIは動作しません')
    }
    return false
  }

  console.log('✅ APIキー検証OK')
  console.log('   - Gemini API: 設定済み')
  return true
}

// APIキーが設定されているかチェックするミドルウェア
const requireGeminiApiKey = (req, res, next) => {
  if (!GEMINI_API_KEY) {
    return res.status(503).json({
      error: 'Gemini APIキーが設定されていません',
      code: 'MISSING_API_KEY'
    })
  }
  next()
}

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

// ============================================================
// CORS設定（セキュリティ強化版）
// ============================================================
const allowedOrigins = [
  // ローカル開発環境
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
  // 環境変数で指定された本番ドメイン
  process.env.PRODUCTION_ORIGIN,
].filter(Boolean) // undefined を除去

// 動的に許可するドメインパターン（トンネルサービス用）
const allowedOriginPatterns = [
  /^https:\/\/.*\.trycloudflare\.com$/,  // Cloudflare Tunnel
  /^https:\/\/.*\.ngrok-free\.app$/,      // ngrok (新ドメイン)
  /^https:\/\/.*\.ngrok\.io$/,            // ngrok (旧ドメイン)
  /^https:\/\/.*\.loca\.lt$/,             // localtunnel
]

const corsOptions = {
  origin: (origin, callback) => {
    // オリジンがない場合（同一オリジン、curl等）は許可
    if (!origin) {
      return callback(null, true)
    }

    // 許可リストに含まれている場合
    if (allowedOrigins.includes(origin)) {
      return callback(null, true)
    }

    // パターンマッチで許可（トンネルサービス）
    const isAllowedPattern = allowedOriginPatterns.some(pattern => pattern.test(origin))
    if (isAllowedPattern) {
      return callback(null, true)
    }

    // 開発モードではすべて許可（本番では削除推奨）
    if (process.env.NODE_ENV !== 'production') {
      console.log(`⚠️  開発モード: 未登録オリジンを許可: ${origin}`)
      return callback(null, true)
    }

    // 本番環境では拒否
    console.log(`🚫 CORS拒否: ${origin}`)
    return callback(new Error('CORS policy violation'), false)
  },
  credentials: true,  // Cookie等の認証情報を許可
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}

app.use(cors(corsOptions))

// JSON形式のデータ制限を 50MB に拡大
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// 戦略的分析エンドポイント（Gemini統一版）
app.post('/api/analyze', requireGeminiApiKey, async (req, res) => {
  try {
    const { imageBase64 } = req.body

    if (!imageBase64) {
      return res.status(400).json({ error: '画像データが必要です' })
    }

    // Base64データからプレフィックスを除去
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')

    const prompt = `あなたは「片付けの司令塔AI」です。この部屋の写真を戦略的に分析してください。

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

まず、分析コメントを2〜3文で書いてください。温かく励ますトーンで書いてください。

次に、必ず以下のJSON形式で出力してください：
{
  "dirtyLevel": 0-100の数値,
  "selectedZone": "選んだエリア名",
  "reason": "なぜこのエリアから始めるべきか（ユーザーを励ます温かい言葉で）",
  "tasks": ["タスク1", "タスク2", "タスク3"],
  "estimatedTime": "推定所要時間（例：10分）",
  "zones": ["認識した全エリアのリスト"]
}`

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${GEMINI_API_KEY}`,
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
                  inline_data: {
                    mime_type: 'image/jpeg',
                    data: base64Data,
                  },
                },
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 2048,
          },
        }),
      }
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('Gemini API エラー:', errorData)
      return res.status(response.status).json({
        error: errorData.error?.message || 'Gemini API エラー',
      })
    }

    const data = await response.json()
    const analysisText = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

    console.log('\n📊 === 戦略的分析結果（Gemini） ===')
    console.log(analysisText)
    console.log('=================================\n')

    res.json({
      success: true,
      analysis: analysisText,
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
 * 【v3.1】キッチン設備の座標取得を最重要タスクとして強化
 */
const createAnalysisPrompt = () => `You are a professional room organizer AI with object detection capabilities.

【CRITICAL TASK - HIGHEST PRIORITY】
Detect and provide PRECISE bounding box coordinates for ALL kitchen appliances and fixed installations.
This is the MOST IMPORTANT part of your analysis. The coordinates will be used to PROTECT these objects.

【MANDATORY DETECTION TARGETS - Must detect with bbox】
1. IH cooktop / Gas stove (コンロ) - BLACK or SILVER cooking surface
2. Kitchen sink and faucet (シンク・蛇口)
3. Range hood / Ventilation fan (換気扇・レンジフード)
4. Refrigerator (冷蔵庫)
5. Microwave / Oven (電子レンジ・オーブン)
6. Rice cooker (炊飯器)
7. Large furniture (tables, chairs, beds, sofas)

【BOUNDING BOX FORMAT】
For EACH item above, provide coordinates as [ymin, xmin, ymax, xmax] where:
- Values are normalized from 0.0 to 1.0
- ymin = top edge, ymax = bottom edge
- xmin = left edge, xmax = right edge
- Be GENEROUS with the bounding box - include some margin around the object

【REMOVE - 片付け対象】
These items should be cleaned up:
- 書類・紙類: 散らばった書類、雑誌、新聞、チラシ
- 小物: 文房具、おもちゃ、雑貨、アクセサリー
- 衣類: 脱ぎ捨てた服、バッグ、帽子、靴下
- 食器・飲料: コップ、皿、ペットボトル、空き缶、食べ残し
- ゴミ: ティッシュ、包装紙、空き箱、ビニール袋
- ケーブル: 乱雑に放置されたコード類

【OUTPUT FORMAT - JSON ONLY】
{
  "critical_appliances": [
    {
      "item": "IHコンロ",
      "type": "cooktop",
      "bbox": [ymin, xmin, ymax, xmax],
      "confidence": 0.0-1.0
    }
  ],
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
}

IMPORTANT: If you detect ANY kitchen appliance (especially cooktop/stove), it MUST be in "critical_appliances" with accurate bbox.`

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
 * 【v3.1】戦略2: ネガティブプロンプトを最優先配置 + 座標保護強化
 */
const createEditPrompt = (editType, removeList = [], roomType = 'general', protectedBoundaries = [], criticalAppliances = []) => {
  const protectionCommand = createProtectionCommand(roomType)

  // REMOVEリストをフォーマット
  const removeListText = removeList.length > 0
    ? removeList.map((item, i) => `${i + 1}. ${item}`).join('\n')
    : '(分析結果なし - 一般的な散らかりを除去)'

  // 【戦略1+2】座標保護情報を最重要セクションとしてフォーマット
  const allProtectedItems = [...criticalAppliances, ...protectedBoundaries]

  // 【戦略2】ネガティブプロンプト - プロンプトの最初に配置
  const criticalProtectionHeader = `
######################################################################
#  CRITICAL - DO NOT REMOVE - READ THIS FIRST                        #
######################################################################

THE FOLLOWING ITEMS MUST REMAIN VISIBLE IN THE OUTPUT IMAGE.
IF ANY OF THESE ITEMS DISAPPEAR OR ARE ALTERED, THE GENERATION IS A FAILURE.

【PROTECTED ITEMS LIST】
${allProtectedItems.length > 0
  ? allProtectedItems.map((item, i) => {
      const bboxStr = item.bbox ? ` | PROTECTED ZONE: [${item.bbox.join(', ')}]` : ''
      return `★ ${i + 1}. ${item.item}${bboxStr}`
    }).join('\n')
  : '- IH cooktop / Gas stove (if visible)\n- Kitchen sink and faucet (if visible)\n- All large furniture and appliances'}

${allProtectedItems.length > 0 ? `
【PIXEL-LEVEL PROTECTION ZONES】
The following coordinate regions contain essential appliances.
You MUST preserve the ORIGINAL PIXELS in these regions EXACTLY as they are:
${allProtectedItems.filter(item => item.bbox).map((item, i) =>
  `ZONE ${i + 1}: ${item.item} → bbox[${item.bbox.join(', ')}] - DO NOT MODIFY`
).join('\n')}
` : ''}

######################################################################
`.trim()

  // 通常の保護コマンド（プロンプトの後半に配置）
  const boundariesText = allProtectedItems.length > 0
    ? `\n[ADDITIONAL PROTECTION REMINDER]
The items and zones listed in CRITICAL section above are IMMUTABLE.
Any modification to these protected zones will result in rejection.`
    : ''

  if (editType === 'future_vision') {
    // 通常モード: バランスの取れた編集
    return `${criticalProtectionHeader}

${protectionCommand}${boundariesText}

######################################################################
#  MANDATORY: DRAMATIC TRANSFORMATION REQUIRED                       #
######################################################################

The output image MUST show a DRAMATIC "before and after" difference.
If the input has clutter on counters/floors, the output MUST have CLEAN surfaces.
A subtle change is NOT acceptable - the transformation must be VISIBLE and SIGNIFICANT.

[MISSION] Transform this messy room into a CLEAN, organized space.

[ITEMS TO REMOVE - CLEAR THESE COMPLETELY]
${removeListText}

[REQUIRED RESULT]
- Countertops: MUST be 90% clear (only permanent appliances remain)
- Floor: MUST be completely clear of loose items
- Sink area: MUST be clean and empty
- The difference from original MUST be immediately obvious

[EDITING RULES]
1. AGGRESSIVELY remove all clutter and loose items
2. Where items are removed, RECONSTRUCT the background using surrounding textures
3. Do NOT add any new objects, decorations, or furniture
4. Preserve ONLY the items in PROTECTED ZONES above
5. The result should look like a "professionally cleaned" version

[TECHNIQUE]
- Use content-aware fill to restore hidden surfaces
- Match floor/wall textures seamlessly
- Maintain consistent lighting across edited areas

${qualityKeywords}

Generate a DRAMATICALLY CLEANER version of this room.`
  }

  if (editType === 'future_vision_stronger') {
    // 強化モード: より徹底的だが制御された編集
    return `${criticalProtectionHeader}

${protectionCommand}${boundariesText}

######################################################################
#  MANDATORY: EXTREME TRANSFORMATION REQUIRED                        #
######################################################################

This is a DEEP CLEAN operation. The output MUST look like a completely different level of cleanliness.
Imagine a professional cleaning service spent hours on this room.
If the change is not DRAMATIC, this generation is a FAILURE.

[MISSION] EXTREME deep clean - create a "model home" level of cleanliness.

[TARGETS FOR COMPLETE REMOVAL]
${removeListText}

[AGGRESSIVE CLEANUP REQUIREMENTS]
- Clear 100% of loose items from ALL surfaces
- Remove EVERYTHING from countertops (except built-in appliances)
- Clear ALL floor clutter completely
- Remove items from sink area
- The before/after difference MUST be shocking

[ABSOLUTE PROHIBITIONS - VIOLATION = FAILURE]
- NEVER remove or alter items in the PROTECTED ZONES listed above
- NEVER remove large furniture (tables, chairs, sofas, beds)
- NEVER remove kitchen appliances (stove, cooktop, refrigerator, microwave, sink)
- NEVER add vases, plants, flowers, or decorations
- NEVER change wall colors or floor materials
- NEVER alter the room layout or furniture positions

[RECONSTRUCTION TECHNIQUE]
- Where clutter is removed, seamlessly restore the underlying surface
- Use the surrounding floor/table texture to fill gaps
- Ensure no "ghost shadows" or artifacts remain
- DOUBLE-CHECK that protected zones are unchanged

${qualityKeywords}

Create an EXTREMELY CLEAN version - like a model home showroom.`
  }

  // デフォルト
  return `${criticalProtectionHeader}

${protectionCommand}${boundariesText}

[MISSION] Light cleanup of this room.

[ITEMS TO REMOVE]
${removeListText}

[RULES]
- Remove only obvious clutter
- Keep all furniture and appliances (especially those in PROTECTED ZONES)
- Do not add anything new

${qualityKeywords}`
}

/**
 * 【新機能】検品フェーズ（Self-Critic）
 * 生成画像が基準を満たしているかをチェック
 */
const inspectGeneratedImage = async (originalBase64, generatedBase64, roomType) => {
  const inspectionPrompt = `You are a STRICT quality control inspector for AI-generated cleaned room images.

Compare these TWO images:
1. ORIGINAL image (the messy room)
2. GENERATED image (the cleaned version)

Check the following criteria STRICTLY:

【CRITERION 1: STRUCTURAL INTEGRITY】
- Are all major furniture items (tables, chairs, sofas, beds, shelves) still in the SAME position?
- Are walls, windows, and doors preserved correctly?
- Is the camera angle and perspective EXACTLY the same?

【CRITERION 2: APPLIANCE PRESERVATION - MOST CRITICAL】
THIS IS THE MOST IMPORTANT CHECK. Score 0 if ANY appliance is removed or significantly altered.
Kitchen appliances to check:
- IH cooktop / stove / gas range (コンロ)
- Sink and faucet (シンク・蛇口)
- Refrigerator (冷蔵庫)
- Microwave (電子レンジ)
- Range hood / exhaust fan (換気扇)
- Dishwasher (食洗機)
- Rice cooker, toaster, coffee maker

Other appliances to check:
- TV, monitors, computers
- Air conditioner units
- Washing machine, dryer
- Vacuum cleaner (if visible)

FAIL IMMEDIATELY if:
- Any appliance visible in ORIGINAL is missing in GENERATED
- Any appliance has changed shape, color, or position significantly
- Appliance controls/buttons have disappeared

【CRITERION 3: CLEANUP EFFECTIVENESS - BE EXTREMELY STRICT】
You MUST be very harsh in scoring this criterion. Most AI-generated "cleaned" images are NOT clean enough.

Score 0-3 (FAIL) if ANY of these are true:
- You can still see papers, documents, or mail anywhere
- You can still see dishes, cups, or bottles on surfaces
- You can still see clothes, bags, or personal items
- You can still see toys or random objects on floor/stairs
- The counter/table surfaces are not at least 80% empty
- The floor is not completely clear of loose items
- At first glance, you cannot IMMEDIATELY tell this is a "cleaned" version

Score 4-6 (FAIL) if:
- Some clutter was removed but significant items remain
- The change is noticeable but not dramatic

Score 7-8 (BORDERLINE PASS) if:
- Most visible clutter is gone
- Surfaces are mostly clear
- The transformation is noticeable

Score 9-10 (CLEAR PASS) ONLY if:
- The transformation is SHOCKING - like a different room
- All surfaces are 90%+ empty (only fixed appliances remain)
- Floor is COMPLETELY clear
- It looks like a professional cleaning service spent hours

BE HARSH. If in doubt, score LOWER. A score of 10 should be rare.

【OUTPUT FORMAT - JSON only】
{
  "verdict": "PASS or FAIL",
  "structural_integrity": {
    "score": 0-10,
    "issues": ["list any problems found, or empty array if none"]
  },
  "appliance_preservation": {
    "score": 0-10,
    "missing_appliances": ["list any appliances that were removed or altered"],
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
- PASS: ALL three scores >= 8 (cleanup_effectiveness MUST be >= 8)
- FAIL: Any score < 8

IMPORTANT: Be a strict inspector. It is better to FAIL a mediocre result than to PASS something that doesn't look dramatically cleaner.`

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${GEMINI_API_KEY}`,
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
      console.log('構造整合性:', inspectionResult.structural_integrity?.score)
      console.log('🔥 家電保護:', inspectionResult.appliance_preservation?.score)
      if (inspectionResult.appliance_preservation?.missing_appliances?.length > 0) {
        console.log('⚠️ 消失した家電:', inspectionResult.appliance_preservation.missing_appliances.join(', '))
      }
      console.log('片付け効果:', inspectionResult.cleanup_effectiveness?.score)
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
app.post('/api/gemini/edit-image', requireGeminiApiKey, async (req, res) => {
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
    // 【v3.1】criticalAppliances（キッチン設備）の座標を最重要として抽出
    // ============================================================
    console.log('\n🔍 === AI現状分析開始（JSONモード + 座標検出強化） ===')

    let removeList = []
    let roomType = 'general'
    let protectedBoundaries = []
    let criticalAppliances = []  // 【v3.1】キッチン設備など最重要保護対象

    try {
      const analysisPrompt = createAnalysisPrompt()

      const analysisResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${GEMINI_API_KEY}`,
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

          // 【v3.1】最重要: critical_appliances（キッチン設備）の座標を取得
          if (analysisJson.critical_appliances && Array.isArray(analysisJson.critical_appliances)) {
            criticalAppliances = analysisJson.critical_appliances
              .filter(item => item.bbox && Array.isArray(item.bbox) && item.bbox.length === 4)
              .map(item => ({
                item: item.item,
                type: item.type || 'appliance',
                bbox: item.bbox,
                confidence: item.confidence || 0.8
              }))
            console.log('🔥 クリティカル設備検出:', criticalAppliances.length, '個')
            criticalAppliances.forEach(a => {
              console.log(`   - ${a.item} (${a.type}): bbox[${a.bbox.join(', ')}]`)
            })
          }

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
          console.log('🔒 クリティカル保護:', criticalAppliances.length, '個')

        } catch (parseError) {
          console.log('⚠️ JSONパースエラー、フォールバック処理:', parseError.message)
          // フォールバック: テキストから抽出を試みる
          const itemMatches = analysisText.matchAll(/"item":\s*"([^"]+)"/g)
          for (const match of itemMatches) {
            removeList.push(match[1])
          }
        }
      } else {
        // 分析API失敗時の詳細出力
        const errorData = await analysisResponse.json().catch(() => ({}))
        console.log('⚠️ 分析API呼び出し失敗:', analysisResponse.status)
        console.log('エラー詳細:', JSON.stringify(errorData, null, 2))

        // デフォルトの片付けリストを設定（分析失敗時のフォールバック）
        console.log('📋 デフォルトの片付けリストを使用')
        removeList = [
          'カウンターの上の書類・紙類',
          'カウンターの上の小物・雑貨',
          '散らばった食器・コップ',
          'ゴミ・空き箱・包装紙',
          '床の上の物'
        ]
        roomType = 'kitchen'  // キッチンと仮定
      }
    } catch (analysisError) {
      console.log('⚠️ 現状分析エラー:', analysisError.message)
      // エラー時もデフォルトリストを使用
      removeList = [
        'カウンターの上の書類・紙類',
        'カウンターの上の小物・雑貨',
        '散らばった食器・コップ',
        'ゴミ・空き箱・包装紙',
        '床の上の物'
      ]
      roomType = 'kitchen'
    }

    // ============================================================
    // 【改善】画像生成関数（リトライ対応）
    // 【v3.1】戦略3: リトライ時は超低温度(0.1)を強制
    // ============================================================

    const generateImage = async (fixInstruction = null, attemptNumber = 1, isRetry = false) => {
      // 【v3.1】criticalAppliancesも含めてプロンプト生成
      let editPrompt = createEditPrompt(editType, removeList, roomType, protectedBoundaries, criticalAppliances)

      // 【v3.5】Flash専用の片付け効果強化
      // Flashモデルは変化が弱い傾向があるため、強い指示を追加
      if (!useProModel) {
        const flashCleanupBoost = `
############################################################
#  ⚡ FLASH MODEL: AGGRESSIVE CLEANUP REQUIRED ⚡           #
############################################################

THIS IMAGE MUST LOOK DRAMATICALLY DIFFERENT AFTER CLEANING.
A subtle change is NOT acceptable. The transformation must be OBVIOUS.

🎯 YOUR MISSION: Make this room look like a PROFESSIONAL CLEANER spent 2 hours here.

REMOVE AGGRESSIVELY:
✗ ALL papers, documents, mail on surfaces → REMOVE COMPLETELY
✗ ALL dishes, cups, bottles → REMOVE COMPLETELY
✗ ALL clothes, bags, personal items → REMOVE COMPLETELY
✗ ALL small clutter and random objects → REMOVE COMPLETELY
✗ ALL trash and packaging → REMOVE COMPLETELY

RESULT REQUIRED:
✓ Countertops: 90% EMPTY (only fixed appliances remain)
✓ Tables: COMPLETELY CLEAR
✓ Floor: NO loose items visible
✓ The "BEFORE vs AFTER" difference must be SHOCKING

IF THE OUTPUT LOOKS SIMILAR TO INPUT → THIS IS A FAILURE

############################################################

`
        editPrompt = flashCleanupBoost + editPrompt
        console.log('⚡ Flash片付け強化ブースト適用')
      }

      // リトライ時は修正指示を先頭に追加 + 保護強調
      if (fixInstruction) {
        editPrompt = `
############################################################
#  RETRY ATTEMPT - PREVIOUS GENERATION FAILED              #
############################################################

【FAILURE REASON】
${fixInstruction}

【MANDATORY FIX】
You MUST fix this issue. The previous image was REJECTED because important items were removed or altered.

【REMINDER - PROTECTED ITEMS】
${criticalAppliances.length > 0
  ? criticalAppliances.map(a => `- ${a.item} at bbox[${a.bbox?.join(', ') || 'detected'}] - MUST REMAIN`).join('\n')
  : '- All kitchen appliances (cooktop, sink, etc.) MUST REMAIN\n- All large furniture MUST REMAIN'}

DO NOT repeat the same mistake. Be MORE CONSERVATIVE this time.

############################################################

${editPrompt}`
      }

      // 【戦略3】temperature設定
      // - リトライ時: 低温度で保守的に
      // - 通常時: モデルとeditTypeに応じて設定
      // 【v3.5】Flash品質向上: 温度を下げて安定化（Pro並みの品質を目指す）
      let temperature
      if (isRetry) {
        temperature = 0.3
        console.log('🔒 リトライモード: temperature 0.3（保守的だが変化は許容）')
      } else if (useProModel) {
        // Pro: 低温度で高品質・安定
        temperature = editType === 'future_vision_stronger' ? 0.5 : 0.4
      } else {
        // Flash: 片付け効果を出すため温度を戻す（低すぎると変化が弱い）
        temperature = editType === 'future_vision_stronger' ? 0.8 : 0.65
        console.log('⚡ Flash片付け強化モード: temperature', temperature)
      }

      // 【v3.2】モデル選択 - 高画質モードで Gemini 3 Pro Image を使用
      // - 高画質モード ON:  gemini-3-pro-image-preview（最高品質、Thinking対応）
      // - 高画質モード OFF: gemini-3.1-flash-image（高速、効率的）
      const modelName = useProModel
        ? 'gemini-3-pro-image-preview'
        : 'gemini-3.1-flash-image'

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
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`,
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

    // ============================================================
    // 【v3.3】503エラー対策: 自動リトライ + フォールバック
    // ============================================================
    let response = await generateImage(null, 1)
    let usedFallbackModel = false
    let actualModelUsed = useProModel ? 'gemini-3-pro-image-preview' : 'gemini-3.1-flash-image'

    // 503エラー（モデル過負荷）の場合、リトライまたはフォールバック
    if (response.status === 503) {
      console.log('\n⚠️ === 503 Model Overloaded - リトライ開始 ===')

      // 最大2回リトライ（2秒間隔）
      for (let retryCount = 1; retryCount <= 2; retryCount++) {
        console.log(`🔄 503リトライ ${retryCount}/2 - 2秒待機中...`)
        await new Promise(resolve => setTimeout(resolve, 2000))

        response = await generateImage(null, 1)

        if (response.ok) {
          console.log(`✅ 503リトライ ${retryCount}回目で成功`)
          break
        }

        if (response.status !== 503) {
          console.log(`⚠️ リトライ中に別のエラー: ${response.status}`)
          break
        }

        console.log(`❌ 503リトライ ${retryCount}回目も失敗`)
      }

      // それでも503ならGemini 2.5 Flashにフォールバック（高画質モードの場合のみ）
      if (response.status === 503 && useProModel) {
        console.log('\n🔄 === Gemini 2.5 Flash にフォールバック ===')

        const fallbackModelName = 'gemini-3.1-flash-image'
        const fallbackResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${fallbackModelName}:generateContent?key=${GEMINI_API_KEY}`,
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
                      text: createEditPrompt(editType, removeList, roomType, protectedBoundaries, criticalAppliances),
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
                temperature: editType === 'future_vision_stronger' ? 0.8 : 0.7,
              },
            }),
          }
        )

        if (fallbackResponse.ok) {
          console.log('✅ フォールバック成功 - Gemini 2.5 Flash を使用')
          response = fallbackResponse
          usedFallbackModel = true
          actualModelUsed = fallbackModelName
        } else {
          console.log('❌ フォールバックも失敗')
        }
      }
    }

    if (!response.ok) {
      const errorData = await response.json()
      console.error('Gemini API エラー:', errorData)

      if (response.status === 429) {
        return res.status(429).json({
          error: 'APIのレート制限に達しました。少し時間をおいてから再度お試しください。',
          retryAfter: 30
        })
      }

      if (response.status === 503) {
        return res.status(503).json({
          error: 'AIモデルが現在混雑しています。しばらく待ってから再度お試しください。',
          retryAfter: 10,
          suggestion: '高画質モードをOFFにすると成功率が上がる場合があります'
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

          // 【v3.1】戦略3: リトライ時は isRetry=true で超低温度(0.1)を強制
          const retryResponse = await generateImage(inspectionResult.fix_instruction, 2, true)

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

    // レスポンス用のモデル名（フォールバック時は実際に使用したモデルを表示）
    const responseModelName = actualModelUsed

    res.json({
      success: true,
      imageBase64: finalImageBase64,
      imageUrl: `data:image/png;base64,${finalImageBase64}`,
      model: responseModelName,
      usedFallback: usedFallbackModel,
      fallbackReason: usedFallbackModel ? 'Gemini 3 Proが混雑していたため、2.5 Flashで生成しました' : null,
      usage: usageTracker.getStatus(),
      debug: {
        roomType,
        removeItemCount: removeList.length,
        protectedBoundariesCount: protectedBoundaries.length,
        criticalAppliancesCount: criticalAppliances.length,
        criticalAppliances: criticalAppliances.map(a => ({ item: a.item, bbox: a.bbox })),
        temperature: useProModel
          ? (editType === 'future_vision_stronger' ? 0.4 : 0.3)
          : (editType === 'future_vision_stronger' ? 0.6 : 0.5),
        retryTemperature: didRetry ? 0.1 : null,
        inspectionResult: inspectionResult || { message: '検品未実施' },
        didRetry,
        usedFallbackModel,
        originalModelRequested: useProModel ? 'gemini-3-pro-image-preview' : 'gemini-3.1-flash-image',
        actualModelUsed,
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
app.post('/api/gemini/inpaint', requireGeminiApiKey, async (req, res) => {
  try {
    const { imageBase64, maskBase64, editType } = req.body

    if (!imageBase64) {
      return res.status(400).json({ error: '画像データが必要です' })
    }

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')

    const inpaintPrompt = `Clean up this room. Remove all clutter and mess from the floor and surfaces. Keep furniture in place. Restore the original floor and wall textures where items are removed.`

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent?key=${GEMINI_API_KEY}`,
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
app.post('/api/generate-image', requireGeminiApiKey, async (req, res) => {
  req.body.editType = 'future_vision'
  return res.redirect(307, '/api/gemini/edit-image')
})

// ============================================================
// 片付け場所分析エンドポイント
// ============================================================
app.post('/api/analyze-cleanup-spots', requireGeminiApiKey, async (req, res) => {
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

    const analyzePrompt = `【TASK】部屋を分析し、ゲシュタルト心理学に基づくマイクロ片付けタスクを提案してください。

【最重要：見逃し禁止】
画像を隅々まで注意深く観察し、テーブルや床の上にある全てのアイテムを検出してください。
小さいものも、部分的にしか見えないものも、全て拾い上げること。

チェックリスト（見落としやすいもの）:
- 飲み物（コップ、ペットボトル、缶）
- 食べ物・お菓子
- リモコン
- スマートフォン、タブレット、充電器
- メガネ、メガネケース
- ティッシュ箱、ティッシュのゴミ
- 本、雑誌、新聞
- 書類、封筒、チラシ、レシート
- ペン、ハサミ、文房具
- 化粧品、ハンドクリーム
- 鍵、財布
- ケーブル、イヤホン
- 袋、箱

【重要】
- 各タスクは30秒〜2分で完了でき、視覚的な「秩序感」の向上が著しいものにする
- 部屋が完全に片付くまで必要なタスクを全て生成する（上限なし）
- 見えているアイテム全てに対応するタスクを作成する
- 少なすぎは禁止（最低でも5個以上）

【タスクの細分化ルール - 最重要】
1つのタスクには1つのアクションだけ。複合的な指示は禁止。

悪い例（禁止）:
❌「カウンター上の食品や調味料を整理し、使用頻度の低いものは収納する」
❌「書類を分類して、不要なものは捨てる」
❌「衣類を畳んで、クローゼットにしまう」

良い例（推奨）:
✅「カウンター上の食品をキッチンへ持っていく」
✅「調味料をキッチンの棚に戻す」
✅「書類を一箇所に集める」
✅「不要な紙をゴミ箱に捨てる」
✅「衣類を畳む」
✅「畳んだ衣類をクローゼットへ持っていく」

各タスクは「〇〇を△△する」という単純な形式にする。
「整理する」「片付ける」などの曖昧な動詞は使わない。

【カテゴリー別のアクション例】
■ 書類・紙類 (documents)
  - 「バラバラの紙を1つの束にまとめ、角を机の角に合わせる」(30秒)
  - 「DMやチラシを、大きいものから順に重ね直す」(60秒)
  - 「書類の向きを揃えて一箇所に重ねる」(60秒)

■ 衣類・布製品 (clothes)
  - 「床の衣類をベッドの上かカゴに集める」(60秒)
  - 「ハンガーの衣類の向きを揃える」(90秒)

■ 食器・キッチン用品 (kitchen)
  - 「シンクの食器を重ねられるもの同士で積み上げる」(60秒)
  - 「同じ素材のものを集める（ガラス、陶器等）」(90秒)

■ 文房具・おもちゃ (stationery)
  - 「赤いものだけをペン立てに戻す」(30秒)
  - 「散らばった小物を部屋の中央に集める」(60秒)

【OUTPUT FORMAT - JSON only】
{
  "spots": [
    {
      "category": "documents/clothes/kitchen/stationery/other",
      "location": "場所名（例：テーブルの上）",
      "items": "散らかっているもの",
      "action": "30秒〜2分でできる具体的なアクション",
      "principle": "適用するゲシュタルト法則（近接/類同/閉合/共通運命）",
      "visualEffect": "視覚的効果の説明（丁寧語で。例：輪郭が明確になります、ノイズが減ります）",
      "estimatedTime": "30秒/60秒/90秒/2分"
    }
  ],
  "totalEstimatedTime": "全体の推定時間",
  "encouragement": "温かい励ましの言葉（日本語）"
}

【ルール】
- 各タスクは2分以内で完了できるものに限定
- 「内容の確認」や「判断」を必要としないアクションにする
- 「幾何学的な整合」や「グルーピング」に特化する
- visualEffectは丁寧語（です・ます調）で書く
- クリップ、輪ゴム、収納ボックス等の道具を必要とするアクションは避ける
- 「重ねる」「揃える」「集める」「立てる」など道具不要のアクションを優先する

【タスク優先順位 - 画像に実際に見えるものだけを対象にすること】
※以下は「もし見えたら」の条件付きルール。見えないものはタスクに含めないこと。

1. ゴミが見える場合のみ → 最初のタスク：「ゴミをゴミ箱に捨てる」（30秒）
2. 別の場所にあるべきものが見える場合のみ → 「〇〇を△△へ移動する」
   - テーブルやデスクに食器・コップがある → 「食器をキッチンへ持っていく」
   - リビングに洗濯物がある → 「洗濯物を寝室へ移動する」
   - 調味料がダイニングにある → 「調味料をキッチンへ戻す」
3. その後、整理・グルーピングのタスク

【絶対ルール】
- 画像に写っていないものをタスクに含めてはいけない（存在しないアイテムの捏造は厳禁）
- 推測や一般的なアドバイスは禁止
- 実際に見えるアイテムだけを具体的に指示する
- 「小物」「雑貨」「もの」などの曖昧な表現は禁止
- 必ず具体的なアイテム名を使う（例：リモコン、ペン、本、マグカップ、ティッシュ箱など）
- ユーザーが「あ、これのことだ」とすぐ分かる表現にする

【アクションのルール】
- 食器、コップ、調味料 → 「キッチンへ持っていく」
- お菓子の袋（中身あり）、未開封の食べ物 → 「キッチンへ持っていく」
- お菓子の袋（空）、食べ終わったゴミ、ティッシュのゴミ、レシート → 「ゴミ箱へ捨てる」
- 衣類、タオル → 「洗濯カゴへ入れる」または「クローゼットへ持っていく」
- 本、雑誌 → 「本棚へ戻す」または「重ねて端に寄せる」
- 書類、紙 → 「重ねて揃える」
- おもちゃ → 「おもちゃ置き場へ戻す」
- ペン、文房具 → 「ペン立てに戻す」または「まとめて一箇所に集める」
- ゴミ → 「ゴミ箱へ捨てる」
- ポーチ、バッグ、トートバッグ、財布、メガネケースなど個人の持ち物 → 「所定の場所に戻す」（この表現をそのまま使う）
- おもちゃ、ゲーム、ルービックキューブ、ボールなど → 「所定の場所に戻す」（この表現をそのまま使う）
- 帽子、衣類小物 → 「所定の場所に戻す」（「クローゼット」など具体的な場所を推測しない）
- その他すべて → 「所定の場所に戻す」を使う（「棚に置く」などと推測しない）
※「棚」「クローゼット」など具体的な場所の推測は禁止。ユーザーの家の収納場所は分からないため。
※「ラベルを揃える」「向きを変える」などの細かい整頓より、まず「あるべき場所へ移動」を優先する

【見逃し防止：細かいものも必ず検出】
ペン、鉛筆、消しゴム、クリップ、輪ゴム、シール、小さなおもちゃ、充電ケーブル、イヤホン、
コイン、鍵、アクセサリーなど、小さいものも1つ1つ個別にタスク化すること。
「文房具をまとめる」ではなく「ペンをペン立てに戻す」「消しゴムを筆箱に入れる」のように個別に。`

    // マイクロタスク分析（429エラー時リトライ機能付き）
    const makeRequest = async (retryCount = 0) => {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${GEMINI_API_KEY}`,
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

      // 429エラー時は3秒待ってリトライ（最大2回）
      if (response.status === 429 && retryCount < 2) {
        console.log(`⏳ レート制限 - ${3 * (retryCount + 1)}秒後にリトライ (${retryCount + 1}/2)`)
        await new Promise(resolve => setTimeout(resolve, 3000 * (retryCount + 1)))
        return makeRequest(retryCount + 1)
      }

      return response
    }

    const response = await makeRequest()

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

    // マイクロタスク分析結果をログ出力
    console.log('\n📋 === マイクロタスク分析結果 ===')
    console.log('タスク数:', analysisResult.spots?.length || 0)
    if (analysisResult.spots) {
      analysisResult.spots.forEach((spot, i) => {
        console.log(`  ${i + 1}. [${spot.category}] ${spot.items} → ${spot.action}`)
      })
    }
    console.log('合計時間:', analysisResult.totalEstimatedTime)
    console.log('================================\n')

    res.json({
      success: true,
      ...analysisResult,
    })
  } catch (error) {
    console.error('片付け分析サーバーエラー:', error)
    res.status(500).json({ error: error.message })
  }
})

// ============================================================
// アイテムの住所相談チャット（Gemini会話）
// ============================================================
app.post('/api/chat-address', requireGeminiApiKey, async (req, res) => {
  try {
    const { imageBase64, itemName, category, messages } = req.body

    if (!itemName) {
      return res.status(400).json({ error: 'itemName は必須です' })
    }

    // 画像データの準備（初回のみ画像を含める）
    const base64Data = imageBase64 ? imageBase64.replace(/^data:image\/[a-z]+;base64,/, '') : null

    // プロンプトファイルから思考フレームワークを読み込む
    const promptPath = resolve(__dirname, 'prompts/address-chat.md')
    let basePrompt
    try {
      basePrompt = readFileSync(promptPath, 'utf-8')
    } catch (e) {
      console.warn('⚠️ prompts/address-chat.md が見つかりません。デフォルトプロンプトを使用します')
      basePrompt = 'あなたは片付けアドバイザーです。アイテムの置き場所を一緒に考えてください。'
    }

    const systemInstruction = `${basePrompt}

## 今回のアイテム
- 名前: ${itemName}
- カテゴリ: ${category || '不明'}`

    // 会話履歴を Gemini の contents 形式に変換
    // Gemini API は必ず user ロールから始まる必要がある
    const contents = []

    // 最初のユーザーメッセージ（画像付き・必ず先頭に置く）
    const initialParts = [
      { text: `この部屋の写真を見て、「${itemName}」の住所（定位置）を一緒に決めたいです。まず最初の提案やヒアリングをお願いします。` },
    ]
    if (base64Data) {
      initialParts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: base64Data,
        },
      })
    }
    contents.push({ role: 'user', parts: initialParts })

    // 会話履歴を追加（あれば）
    if (messages && messages.length > 0) {
      for (const msg of messages) {
        contents.push({
          role: msg.role === 'ai' ? 'model' : 'user',
          parts: [{ text: msg.text }],
        })
      }
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemInstruction }],
          },
          contents,
          generationConfig: {
            temperature: 0.7,
            topP: 0.9,
            topK: 40,
            maxOutputTokens: 300,
          },
        }),
      }
    )

    if (!response.ok) {
      const errorData = await response.json()
      console.error('チャットAPI エラー:', errorData)
      return res.status(response.status).json({
        error: errorData.error?.message || 'Gemini API エラー',
      })
    }

    const data = await response.json()
    let replyText = ''
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      for (const part of data.candidates[0].content.parts) {
        if (part.text) {
          replyText += part.text
        }
      }
    }

    res.json({ success: true, reply: replyText })
  } catch (error) {
    console.error('チャットサーバーエラー:', error)
    res.status(500).json({ error: 'チャット処理中にエラーが発生しました' })
  }
})

// ヘルスチェック
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '3.4' })
})

// 使用状況取得
app.get('/api/usage', (req, res) => {
  res.json({
    success: true,
    usage: usageTracker.getStatus(),
  })
})

app.listen(PORT, () => {
  console.log(`🚀 プロキシサーバー v3.4 起動: http://localhost:${PORT}`)
  console.log('')
  validateApiKeys()
  console.log('')
  console.log('改善点:')
  console.log('  ✅ JSONモードによる分析精度向上')
  console.log('  ✅ 不変条件の強化（カメラ/照明/テクスチャ保護）')
  console.log('\n【v3.3 新機能 - 503エラー対策】')
  console.log('  🔄 503エラー時の自動リトライ（最大2回、2秒間隔）')
  console.log('  🔀 リトライ失敗時は Gemini 2.5 Flash に自動フォールバック')
  console.log('  📊 フォールバック使用時はレスポンスに通知を含める')
  console.log('\n【v3.2 機能】')
  console.log('  🌟 高画質モード: Gemini 3 Pro Image（最高品質・Thinking対応）')
  console.log('  ⚡ 通常モード: Gemini 2.5 Flash Image（高速・効率的）')
  console.log('  ✅ temperature調整（Pro: 0.3-0.4, Flash: 0.5-0.6）')
  console.log('  ✅ 品質キーワードの追加')
  console.log('\n【v3.0-3.1 機能】')
  console.log('  🔍 高度な検品フェーズ（Self-Critic）')
  console.log('  🔄 インテリジェントリトライ（FAIL時自動再生成）')
  console.log('  🛡️ 座標指定による物体保護（Bounding Box）')
  console.log('  🔥 critical_appliances による最重要設備の座標検出')
  console.log('  ⚠️  ネガティブプロンプト最優先配置（CRITICAL - DO NOT REMOVE）')
})
