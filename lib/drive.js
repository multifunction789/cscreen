/**
 * Google Drive helper — server-side only
 * ใช้ GoogleAuth + Service Account credentials จาก env
 */
import { GoogleAuth } from 'google-auth-library'
import { google } from 'googleapis'

function getDriveClient() {
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')

  const auth = new GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key:  privateKey,
    },
    scopes: ['https://www.googleapis.com/auth/drive'],
  })

  return google.drive({ version: 'v3', auth })
}

const ROOT_FOLDER = () => process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID

/**
 * หา folder ที่มีชื่อนี้อยู่ใน parent แล้ว — ถ้าไม่มีค่อยสร้าง
 */
export async function getOrCreateFolder(name, parentId = ROOT_FOLDER()) {
  const drive = getDriveClient()

  // ค้นหาก่อน
  const search = await drive.files.list({
    q: `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
    fields: 'files(id,name)',
    spaces: 'drive',
  })

  if (search.data.files?.length > 0) {
    return search.data.files[0].id
  }

  // สร้างใหม่
  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents:  [parentId],
    },
    fields: 'id',
  })

  return created.data.id
}

/**
 * อัปโหลดไฟล์ไปยัง folder ใน Drive
 * @param {Buffer} buffer     — ข้อมูลไฟล์
 * @param {string} filename   — ชื่อไฟล์
 * @param {string} mimeType   — MIME type
 * @param {string} folderId   — destination folder ID
 * @returns {{ id, webViewLink, webContentLink }}
 */
export async function uploadFileToDrive(buffer, filename, mimeType, folderId) {
  const drive = getDriveClient()
  const { Readable } = await import('stream')

  const res = await drive.files.create({
    requestBody: {
      name:    filename,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: Readable.from(buffer),
    },
    fields: 'id,webViewLink,webContentLink',
  })

  // ทำให้ดูได้โดยไม่ต้อง login (anyone with link)
  await drive.permissions.create({
    fileId:      res.data.id,
    requestBody: { role: 'reader', type: 'anyone' },
  })

  const fileId = res.data.id
  // thumbnail URL ใช้ใน <img> ได้เสมอ, uc?export=view มักถูก block
  const directUrl   = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1200`
  const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`

  return {
    id:          fileId,
    webViewLink: res.data.webViewLink,
    directUrl,
    downloadUrl,
  }
}

/**
 * สร้าง folder สำหรับใบงาน (folder เดียว ไฟล์ทั้งหมดลงตรงๆ)
 * ROOT / JO-XXXX_ลูกค้า
 * @returns {{ jobFolderId }}
 */
export async function createJobFolders(jobCode, customerName) {
  const safeName   = customerName.replace(/[/\\:*?"<>|]/g, '').trim()
  const folderName = `${jobCode}_${safeName}`
  const jobFolderId = await getOrCreateFolder(folderName)
  return { jobFolderId, artworkFolderId: jobFolderId, mockupFolderId: jobFolderId, finishFolderId: jobFolderId }
}
