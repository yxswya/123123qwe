import type { NewFile, SelectFile } from '../db/schema'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '../db'
import { files, sessions } from '../db/schema'

export class FileService {
    sessionId: string = ''

    constructor(sessionId: string) {
        this.sessionId = sessionId
    }

    /**
     * 保存文件内容并记录到数据库
     * @param content 文件内容
     * @param fileName 文件名
     * @param messageId 关联的消息ID（可选）
     * @returns 文件记录
     */
    async saveFile(content: string, fileName: string, messageId?: string): Promise<SelectFile> {
        // 生成唯一文件ID和文件路径
        const fileId = nanoid()
        const fileExt = path.extname(fileName) || '.jsonl'
        const storageFileName = `${fileId}${fileExt}`
        const fileDir = path.join(path.resolve(), 'uploads', this.sessionId)

        // 确保目录存在
        await fs.mkdir(fileDir, { recursive: true })

        // 写入文件
        const filePath = path.join(fileDir, storageFileName)
        await fs.writeFile(filePath, content, 'utf-8')

        // 计算相对路径作为fileUrl
        const fileUrl = path.join('uploads', this.sessionId, storageFileName)

        // 插入数据库记录
        const newFile: NewFile = {
            id: fileId,
            sessionId: this.sessionId,
            messageId,
            fileName,
            fileUrl,
        }

        return await db.transaction(async (tx) => {
            const [insertedFile] = await tx.insert(files)
                .values(newFile)
                .returning()

            // 更新会话最新时间
            await tx.update(sessions)
                .set({ lastMessageAt: new Date() })
                .where(eq(sessions.id, this.sessionId))

            return insertedFile
        })
    }

    /**
     * 读取文件内容
     * @param fileId 文件ID
     * @returns 文件内容
     */
    async readFile(fileId: string): Promise<string> {
        const [file] = await db.select().from(files).where(eq(files.id, fileId))
        if (!file) {
            throw new Error('File not found')
        }

        const fullPath = path.join(import.meta.dir, '..', file.fileUrl)
        return await fs.readFile(fullPath, 'utf-8')
    }

    /**
     * 获取会话的所有文件
     * @param sessionId 会话ID
     * @returns 文件列表
     */
    static async getSessionFiles(sessionId: string): Promise<SelectFile[]> {
        return await db.query.files.findMany({
            where: eq(files.sessionId, sessionId),
            orderBy: (files, { desc }) => [desc(files.createdAt)],
        })
    }
}
