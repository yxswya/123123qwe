import type { DatabaseType } from '../db'
import type { NewMessage, SelectMessage } from '../db/schema'
import { eq } from 'drizzle-orm'
import { messages } from '../db/schema'

/**
 * Message Repository Interface
 * 负责消息数据的访问操作
 */
export interface IMessageRepository {
    insert: (
        message: NewMessage,
    ) => Promise<SelectMessage>

    update: (
        id: string,
        data: Partial<NewMessage>,
    ) => Promise<SelectMessage>

    findBySessionId: (
        sessionId: string,
        opts?: { limit?: number, offset?: number },
    ) => Promise<SelectMessage[]>

    findById: (id: string) => Promise<SelectMessage | undefined>
}

/**
 * Message Repository Implementation
 */
export class MessageRepository implements IMessageRepository {
    constructor(private db: DatabaseType) {}

    async insert(message: NewMessage): Promise<SelectMessage> {
        const [newMessage] = await this.db.insert(messages).values(message).returning()
        return newMessage
    }

    async update(id: string, data: Partial<NewMessage>): Promise<SelectMessage> {
        const [updatedMessage] = await this.db
            .update(messages)
            .set(data)
            .where(eq(messages.id, id))
            .returning()

        if (!updatedMessage) {
            throw new Error(`Message with id ${id} not found`)
        }

        return updatedMessage
    }

    async findBySessionId(
        sessionId: string,
        opts: { limit?: number, offset?: number } = {},
    ): Promise<SelectMessage[]> {
        const { limit = 20, offset = 0 } = opts

        const historyMessages = await this.db.query.messages.findMany({
            where: (messages, { eq }) => eq(messages.sessionId, sessionId),
            with: {
                sender: {
                    columns: {
                        id: true,
                        username: true,
                        avatarUrl: true,
                    },
                },
                rags: true,
            },
            orderBy: (messages, { desc }) => [desc(messages.createdAt)],
            limit,
            offset,
        })

        return historyMessages.reverse()
    }

    async findById(id: string): Promise<SelectMessage | undefined> {
        return await this.db.query.messages.findFirst({
            where: (messages, { eq }) => eq(messages.id, id),
        })
    }
}
