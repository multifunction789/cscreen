/**
 * Google Drive helper — server-side only
 */
import { GoogleAuth } from 'google-auth-library'
import { google }     from 'googleapis'

function getDriveClient() {
  const auth = new GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key:  process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive'],
  })
  return google.drive({ version: 'v3', auth })
}

const ROOT_FOLDER = () => process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID

/** escape ค่าที่ใส่ในคำค้นของ Drive (กันชื่อที่มี ' หรือ \ ทำให้คำค้นเพี้ยน/ถูกแทรก) */
const q = v => String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")

/** หา folder ที่มีชื่อนี้ใน parent — ถ้าไม่มีค่อยสร้าง */
export async function getOrCreateFolder(name, parentId = ROOT_FOLDER()) {
  const drive  = getDriveClient()
  const search = await drive.files.list({
    q:      `name='${q(name)}' and mimeType='application/vnd.google-apps.folder' and '${q(parentId)}' in parents and trashed=false`,
    fields: 'files(id,name)',
    spaces: 'drive',
  })
  if (search.data.files?.length > 0) return search.data.files[0].id

  const created = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id',
  })
  return created.data.id
}

/**
 * อนุญาตให้อัปโหลดเฉพาะโฟลเดอร์ของระบบ: โฟลเดอร์หลัก หรือโฟลเดอร์ที่อยู่ใต้โฟลเดอร์หลัก (ไม่เกิน 2 ชั้น)
 * (กันคนส่ง folderId อื่นที่ service account เข้าถึงได้มาเขียนไฟล์)
 */
export async function isAllowedFolder(folderId) {
  const root = ROOT_FOLDER()
  if (!root || !folderId) return false
  if (folderId === root) return true
  try {
    const drive = getDriveClient()
    const { data } = await drive.files.get({ fileId: folderId, fields: 'parents,mimeType,trashed' })
    if (data.mimeType !== 'application/vnd.google-apps.folder' || data.trashed) return false
    const parents = data.parents || []
    if (parents.includes(root)) return true
    // รองรับโครงสร้างเก่า: ROOT / ลูกค้า / งาน (ลึก 2 ชั้น)
    for (const p of parents) {
      const { data: pd } = await drive.files.get({ fileId: p, fields: 'parents' })
      if ((pd.parents || []).includes(root)) return true
    }
    return false
  } catch {
    return false
  }
}

/**
 * อัปโหลดไฟล์ไปยัง folder ใน Drive
 * @returns {{ id, webViewLink, directUrl, downloadUrl }}
 */
export async function uploadFileToDrive(buffer, filename, mimeType, folderId) {
  const drive = getDriveClient()
  const { Readable } = await import('stream')

  const res = await drive.files.create({
    requestBody: { name: filename, parents: [folderId] },
    media:       { mimeType, body: Readable.from(buffer) },
    fields:      'id,webViewLink',
  })

  await drive.permissions.create({
    fileId:      res.data.id,
    requestBody: { role: 'reader', type: 'anyone' },
  })

  const fileId      = res.data.id
  const directUrl   = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1200`
  const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`

  return { id: fileId, webViewLink: res.data.webViewLink, directUrl, downloadUrl }
}

/**
 * สร้าง folder ลูกค้า: ROOT / {code}_{name}_{YYYY-MM-DD}
 * @returns {string} folderId
 */
export async function createCustomerFolder(code, name) {
  const safeName = name.replace(/[/\\:*?"<>|]/g, '').trim()
  const date     = new Date().toISOString().split('T')[0]          // YYYY-MM-DD
  const folderName = `${code}_${safeName}_${date}`
  return getOrCreateFolder(folderName)
}

/**
 * สร้างชื่อไฟล์มาตรฐาน
 * .ai / .psd → คงชื่อเดิม
 * อื่น ๆ    → JO-XXXX_ชื่อลูกค้า_{TYPE}.{ext}
 */
export function buildFilename(originalName, joCode, customerName, type) {
  const ext = originalName.split('.').pop().toLowerCase()
  if (['ai','psd'].includes(ext)) return originalName          // คงชื่อเดิม
  const safe = customerName.replace(/[/\\:*?"<>|]/g, '').trim()
  return `${joCode}_${safe}_${type}.${ext}`
}
