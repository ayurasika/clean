/**
 * 送信前に写真を縮小して JPEG に変換する
 * - 通信量と AI の費用を減らす
 * - 作り直した画像には位置情報などの撮影データ（EXIF）が残らない（プライバシー保護）
 */
export const MAX_SIDE = 1600
export const JPEG_QUALITY = 0.85
export const MAX_FILE_BYTES = 25 * 1024 * 1024

export function drawToJpegDataUrl(source, srcWidth, srcHeight, maxSide = MAX_SIDE) {
  const scale = Math.min(1, maxSide / Math.max(srcWidth, srcHeight))
  const w = Math.max(1, Math.round(srcWidth * scale))
  const h = Math.max(1, Math.round(srcHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d').drawImage(source, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY)
}

/**
 * 選んだ画像ファイルを縮小済み JPEG の data URL にする
 * @param {File} file
 * @returns {Promise<string>}
 */
export function fileToResizedDataUrl(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      try {
        resolve(drawToJpegDataUrl(img, img.naturalWidth, img.naturalHeight))
      } catch (e) {
        reject(e)
      } finally {
        URL.revokeObjectURL(url)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('decode failed'))
    }
    img.src = url
  })
}
