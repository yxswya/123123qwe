import type { DatabaseType } from '../db'
import type { NewRag, SelectMessage } from '../db/schema'
import { eq } from 'drizzle-orm'
import { messages, rags } from '../db/schema'

/**
 * RAG Repository Interface
 * 负责 RAG 相关的数据访问操作
 */
export interface IRagRepository {
    insert: (rag: NewRag) => Promise<void>
}

/**
 * RAG Repository Implementation
 */
export class RagRepository implements IRagRepository {
    constructor(private db: DatabaseType) {}

    async insert(rag: NewRag): Promise<void> {
        await this.db.insert(rags).values(rag).returning()
    }

    /**
     * 在事务中创建 RAG 记录并更新关联消息
     * @param tx - 数据库事务对象
     * @param rag - RAG 数据
     * @returns 更新后的消息
     */
    async insertAndUpdateMessageInTransaction(
        tx: DatabaseType,
        rag: NewRag,
    ): Promise<SelectMessage | null> {
        // 新增 RAG 记录
        await tx.insert(rags).values(rag).returning()

        // 更新关联消息的内容
        const [message] = await tx
            .update(messages)
            .set({
                content: JSON.stringify({
                    stage: 'rag-build-index',
                    status: 'success',
                    title: rag.title,
                }),
                type: 'json',
            })
            .where(eq(messages.id, rag.messageId))
            .returning()

        return message ?? null
    }
}
