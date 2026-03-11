import type { NewMessage, NewSession } from '../db/schema'
import type { ApiResponse } from '../types/response'
import { eq } from 'drizzle-orm'
import { db } from '../db/index'
import { messages, sessions } from '../db/schema'

export class SessionService {
    sessionId: string = ''

    constructor(private userId: string) {}

    async initialize({ sessionId, text }: {
        sessionId: string
        text: string
    }) {
        if (sessionId) {
            this.sessionId = sessionId
        }
        else {
            const session: NewSession = {
                title: `单聊-${Date.now()}`,
                isGroup: false,
                lastMessageAt: new Date(),
                createdAt: new Date(),
            }
            const [newSession] = await db.insert(sessions).values(session).returning()
            this.sessionId = newSession.id
            console.log('会话不存在，创建会话', this.sessionId)
        }

        await this.appendUserMessage(text)
    }

    // 向数据库添加机器人消息
    async appendAssistantMessage(content: string) {
        const message: NewMessage = {
            sessionId: this.sessionId,
            senderId: 'system-bot-id',
            content,
            type: 'json',
        }

        await db.transaction(async (tx) => {
            // 新增消息记录
            const [updatedMessage] = await tx.insert(messages)
                .values(message)
                .returning()

            // 更新会话最新时间
            await tx.update(sessions)
                .set({ lastMessageAt: new Date() })
                .where(eq(sessions.id, message.sessionId))

            return updatedMessage
        })
    }

    // 向数据库添加用户消息
    async appendUserMessage(content: string) {
        const message: NewMessage = {
            sessionId: this.sessionId,
            senderId: this.userId,
            content,
        }

        await db.transaction(async (tx) => {
            // 新增消息记录
            const [updatedMessage] = await tx.insert(messages)
                .values(message)
                .returning()

            // 更新会话最新时间
            await tx.update(sessions)
                .set({ lastMessageAt: new Date() })
                .where(eq(sessions.id, message.sessionId))

            return updatedMessage
        })
    }

    // 从数据库获取指定会话列表消息
    async getMessages(sessionId: string, limit = 20, offset = 0) {
        const historyMessages = await db.query.messages.findMany({
            where: (messages, { eq }) => eq(messages.sessionId, sessionId),
            with: {
                sender: {
                    columns: {
                        id: true,
                        username: true,
                        avatarUrl: true,
                    },
                },
            },
            orderBy: (messages, { desc }) => [desc(messages.createdAt)],
            limit,
            offset,
        })

        return historyMessages.reverse()
    }

    async receiveResponseMessage(response: ApiResponse) {
        console.log('response', response)
        await this.appendAssistantMessage(JSON.stringify(response))
    }
}
