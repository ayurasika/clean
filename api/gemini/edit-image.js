import { handlePreflightAndValidation, callGemini, extractImage } from '../_lib/gemini.js'
import { createAnalysisPrompt, createEditPrompt } from '../_lib/prompts.js'
import { inspectGeneratedImage } from '../_lib/inspect.js'
import { validateImage, getClientIp, friendlyUpstreamError, GENERIC_SERVER_ERROR, logError } from '../_lib/security.js'
import { tryConsume, tryConsumeIp, refundIp, refundGlobal, getUsage, LIMIT_MESSAGES } from '../_lib/ratelimit.js'

// クライアントから受け付ける editType（それ以外は future_vision 扱い）
const ALLOWED_EDIT_TYPES = ['future_vision', 'future_vision_stronger', 'organize']

export default async function handler(req, res) {
  if (handlePreflightAndValidation(req, res)) return

  try {
    const { highQuality } = req.body
    const editType = ALLOWED_EDIT_TYPES.includes(req.body.editType) ? req.body.editType : 'future_vision'

    const image = validateImage(req.body.imageBase64)
    if (!image.ok) {
      return res.status(image.status).json({ error: image.error })
    }
    const base64Data = image.data
    const imageMime = image.mimeType

    // ============================================================
    // 利用回数の制限（1人あたり → 全体。Pro が上限なら Flash に切り替え）
    // ============================================================
    const ip = getClientIp(req)
    if (!(await tryConsumeIp(ip, 'image'))) {
      return res.status(429).json({ error: LIMIT_MESSAGES.ip, code: 'DAILY_LIMIT' })
    }
    let modelTier = null
    if (highQuality === true && (await tryConsume({ tier: 'pro' })).ok) {
      modelTier = 'pro'
    } else if ((await tryConsume({ tier: 'flash' })).ok) {
      modelTier = 'flash'
    } else {
      await refundIp(ip, 'image')
      return res.status(429).json({ error: LIMIT_MESSAGES.global, code: 'DAILY_LIMIT' })
    }
    const useProModel = modelTier === 'pro'

    // ============================================================
    // JSONモードによる現状分析
    // ============================================================
    console.log('🔍 AI現状分析開始')

    let removeList = []
    let roomType = 'general'
    let protectedBoundaries = []
    let criticalAppliances = []

    try {
      if (!(await tryConsume({ tier: 'text' })).ok) {
        throw new Error('text tier daily limit reached - skip analysis')
      }
      const analysisPrompt = createAnalysisPrompt()

      const analysisResponse = await callGemini('gemini-3.8-flash', {
        contents: [
          {
            parts: [
              { text: analysisPrompt },
              { inlineData: { mimeType: imageMime, data: base64Data } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json',
        },
      })

      if (analysisResponse.ok) {
        const analysisData = await analysisResponse.json()
        const analysisText = analysisData.candidates?.[0]?.content?.parts?.[0]?.text || ''

        try {
          const analysisJson = JSON.parse(analysisText)

          if (analysisJson.critical_appliances && Array.isArray(analysisJson.critical_appliances)) {
            criticalAppliances = analysisJson.critical_appliances
              .filter(item => item.bbox && Array.isArray(item.bbox) && item.bbox.length === 4)
              .map(item => ({
                item: item.item,
                type: item.type || 'appliance',
                bbox: item.bbox,
                confidence: item.confidence || 0.8
              }))
          }

          if (analysisJson.remove_items && Array.isArray(analysisJson.remove_items)) {
            removeList = analysisJson.remove_items.map(item => `${item.location}の${item.item}`)
          }

          if (analysisJson.keep_items && Array.isArray(analysisJson.keep_items)) {
            protectedBoundaries = analysisJson.keep_items
              .filter(item => item.bbox && Array.isArray(item.bbox) && item.bbox.length === 4)
              .map(item => ({ item: item.item, bbox: item.bbox }))
          }

          if (analysisJson.room_type) {
            roomType = analysisJson.room_type
          }

          console.log('✅ 分析完了 - 部屋:', roomType, 'REMOVE:', removeList.length, '保護:', protectedBoundaries.length)
        } catch (parseError) {
          const itemMatches = analysisText.matchAll(/"item":\s*"([^"]+)"/g)
          for (const match of itemMatches) {
            removeList.push(match[1])
          }
        }
      } else {
        removeList = ['カウンターの上の書類・紙類', 'カウンターの上の小物・雑貨', '散らばった食器・コップ', 'ゴミ・空き箱・包装紙', '床の上の物']
        roomType = 'kitchen'
      }
    } catch (analysisError) {
      console.log('⚠️ 分析エラー:', analysisError.message)
      removeList = ['カウンターの上の書類・紙類', 'カウンターの上の小物・雑貨', '散らばった食器・コップ', 'ゴミ・空き箱・包装紙', '床の上の物']
      roomType = 'kitchen'
    }

    // ============================================================
    // 画像生成
    // ============================================================
    const generateImage = async (fixInstruction = null, attemptNumber = 1, isRetry = false) => {
      let editPrompt = createEditPrompt(editType, removeList, roomType, protectedBoundaries, criticalAppliances)

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
      }

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

      let temperature
      if (isRetry) {
        temperature = 0.3
      } else if (useProModel) {
        temperature = editType === 'future_vision_stronger' ? 0.5 : 0.4
      } else {
        temperature = editType === 'future_vision_stronger' ? 0.8 : 0.65
      }

      const modelName = useProModel
        ? 'gemini-3-pro-image-preview'
        : 'gemini-3.1-flash-image'

      console.log(`画像生成 試行${attemptNumber} - モデル: ${modelName}, temp: ${temperature}`)

      const response = await callGemini(modelName, {
        contents: [
          {
            parts: [
              { text: editPrompt },
              { inlineData: { mimeType: imageMime, data: base64Data } },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ['Image', 'Text'],
          temperature,
        },
      })

      return response
    }

    // 503エラー対策: リトライ + フォールバック
    let response = await generateImage(null, 1)
    let usedFallbackModel = false
    let actualModelUsed = useProModel ? 'gemini-3-pro-image-preview' : 'gemini-3.1-flash-image'

    if (response.status === 503) {
      for (let retryCount = 1; retryCount <= 2; retryCount++) {
        console.log(`🔄 503リトライ ${retryCount}/2`)
        await new Promise(resolve => setTimeout(resolve, 2000))
        response = await generateImage(null, 1)
        if (response.ok || response.status !== 503) break
      }

      if (response.status === 503 && useProModel && (await tryConsume({ tier: 'flash' })).ok) {
        console.log('🔄 Flashにフォールバック')
        const fallbackResponse = await callGemini('gemini-3.1-flash-image', {
          contents: [
            {
              parts: [
                { text: createEditPrompt(editType, removeList, roomType, protectedBoundaries, criticalAppliances) },
                { inlineData: { mimeType: imageMime, data: base64Data } },
              ],
            },
          ],
          generationConfig: {
            responseModalities: ['Image', 'Text'],
            temperature: editType === 'future_vision_stronger' ? 0.8 : 0.7,
          },
        })

        if (fallbackResponse.ok) {
          response = fallbackResponse
          usedFallbackModel = true
          actualModelUsed = 'gemini-3.1-flash-image'
          await refundGlobal('pro') // Pro は使われなかった
        } else {
          await refundGlobal('flash')
        }
      }
    }

    if (!response.ok) {
      console.error(`画像生成 Gemini API エラー: HTTP ${response.status}`)
      // 生成できなかったので、今回の分は数えない
      await refundIp(ip, 'image')
      await refundGlobal(modelTier)
      const f = friendlyUpstreamError(response.status)
      return res.status(f.status).json({ error: f.error, retryAfter: f.status === 429 ? 30 : 10 })
    }

    const data = await response.json()
    let generatedImageBase64 = extractImage(data)

    if (!generatedImageBase64) {
      return res.status(502).json({
        error: '画像の生成に失敗しました。別の写真で、もう一度お試しください。',
      })
    }

    // 検品フェーズ + リトライ
    let inspectionResult = null
    let didRetry = false
    let finalImageBase64 = generatedImageBase64

    if ((await tryConsume({ tier: 'inspection' })).ok) {
      inspectionResult = await inspectGeneratedImage(base64Data, generatedImageBase64, roomType, imageMime)
    }

    const retryModelTier = modelTier // generateImage() は最初に選んだモデルで作り直す
    let canRetry = false
    if (inspectionResult?.verdict === 'FAIL' && (await tryConsume({ tier: 'retry' })).ok) {
      if ((await tryConsume({ tier: retryModelTier })).ok) {
        canRetry = true
      } else {
        await refundGlobal('retry')
      }
    }

    if (canRetry) {
      console.log('🔄 検品FAIL - リトライ開始')
      const retryResponse = await generateImage(inspectionResult.fix_instruction, 2, true)

      if (retryResponse.ok) {
        const retryData = await retryResponse.json()
        const retryImageBase64 = extractImage(retryData)

        if (retryImageBase64) {
          if ((await tryConsume({ tier: 'inspection' })).ok) {
            const retryInspection = await inspectGeneratedImage(base64Data, retryImageBase64, roomType, imageMime)
            if (retryInspection) inspectionResult = retryInspection
          }
          finalImageBase64 = retryImageBase64
          didRetry = true
        }
      }
    }

    res.json({
      success: true,
      imageBase64: finalImageBase64,
      imageUrl: `data:image/png;base64,${finalImageBase64}`,
      model: actualModelUsed,
      usedFallback: usedFallbackModel,
      fallbackReason: usedFallbackModel ? 'Gemini 3 Proが混雑していたため、2.5 Flashで生成しました' : null,
      usage: (await getUsage(ip)).usage,
      debug: {
        roomType,
        removeItemCount: removeList.length,
        protectedBoundariesCount: protectedBoundaries.length,
        criticalAppliancesCount: criticalAppliances.length,
        inspectionVerdict: inspectionResult?.verdict || 'NOT_RUN',
        didRetry,
        usedFallbackModel,
        actualModelUsed,
      }
    })
  } catch (error) {
    logError('画像生成サーバーエラー', error)
    res.status(500).json({ error: GENERIC_SERVER_ERROR })
  }
}
