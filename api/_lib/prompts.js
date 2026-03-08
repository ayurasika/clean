/**
 * プロンプト生成関数群（server.js から移植）
 */

export const createAnalysisPrompt = () => `You are a professional room organizer AI with object detection capabilities.

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

export const createProtectionCommand = (roomType = 'general') => {
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

export const qualityKeywords = `
[OUTPUT QUALITY REQUIREMENTS]
- High-resolution photography quality (8K UHD)
- Realistic shadows with soft edges
- Natural indoor lighting preservation
- Professional architectural photography style
- No blur, no distortion, no artifacts
- Clean and sharp edges on all objects
- Photorealistic texture rendering
`.trim()

export const createEditPrompt = (editType, removeList = [], roomType = 'general', protectedBoundaries = [], criticalAppliances = []) => {
  const protectionCommand = createProtectionCommand(roomType)

  const removeListText = removeList.length > 0
    ? removeList.map((item, i) => `${i + 1}. ${item}`).join('\n')
    : '(分析結果なし - 一般的な散らかりを除去)'

  const allProtectedItems = [...criticalAppliances, ...protectedBoundaries]

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

  const boundariesText = allProtectedItems.length > 0
    ? `\n[ADDITIONAL PROTECTION REMINDER]
The items and zones listed in CRITICAL section above are IMMUTABLE.
Any modification to these protected zones will result in rejection.`
    : ''

  if (editType === 'future_vision') {
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
