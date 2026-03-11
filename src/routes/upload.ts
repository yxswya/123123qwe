import { mkdir } from 'node:fs/promises'
import path, { join } from 'node:path'
import Elysia, { t } from 'elysia'
import { authPlugin } from '../plugins/auth'

const UPLOADS_DIR = path.join(path.resolve(), 'uploads')
async function ensureUploadDir() {
    try {
        await mkdir(UPLOADS_DIR, { recursive: true })
    }
    catch (error) {
        console.error('Failed to create upload directory:', error)
    }
}
ensureUploadDir()

export const uploadRoutes = new Elysia({ prefix: '/upload' })
    .use(authPlugin)
    .guard({
        beforeHandle: ({ user, set }) => {
            if (!user) {
                set.status = 401
                return { error: 'Unauthorized' }
            }
        },
    }, app => app.post('/', async ({ body }) => {
        const uploadedFiles: string[] = []
        const files = body.files as File[] | File

        const fileArray = Array.isArray(files) ? files : [files]

        for (const file of fileArray) {
        // 生成唯一文件名
            const timestamp = Date.now()
            const randomStr = Math.random().toString(36).substring(2, 15)
            const fileExtension = file.name.split('.').pop() || ''
            const uniqueFileName = `${timestamp}_${randomStr}.${fileExtension}`
            const filePath = join(UPLOADS_DIR, uniqueFileName)

            // 将文件写入磁盘
            const buffer = await file.arrayBuffer()
            await Bun.write(filePath, buffer)

            // 返回相对路径
            uploadedFiles.push(`/uploads/${uniqueFileName}`)
        }

        console.log(`Uploaded ${fileArray.length} file(s)`)

        return {
            success: true,
            data: uploadedFiles,
        }
    }, {
        body: t.Object({
            files: t.Files({
                minItems: 1,
            }),
        }),
        detail: {
            tags: ['文件管理'],
            summary: '上传文件',
            description: '上传一个或多个文件，返回上传后的文件路径数组。',
        },
    }))
