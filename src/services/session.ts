import type { NewMessage, NewSession, SelectMessage, SelectSession } from '../db/schema'
import type { ApiResponse } from '../types/response'
import { eq } from 'drizzle-orm'
import { db } from '../db/index'
import { messages, sessions } from '../db/schema'
import { hasAnswer } from '../types/response'

export class SessionService {
    sessionId: string = ''
    session: SelectSession | undefined = undefined

    constructor(private userId: string) {}

    async initialize({ sessionId, text }: {
        sessionId: string
        text: string
    }): Promise<SelectMessage[]> {
        const result: SelectMessage[] = []
        if (sessionId) {
            this.sessionId = sessionId
            this.session = await this.getSession()
        }
        else {
            const session = await this.createSession()
            this.sessionId = session.id
            console.log('会话不存在，创建会话', this.sessionId)
        }

        result.push(await this.appendUserMessage(text))
        result.push(await this.appendAssistantMessage())

        return result
    }

    // 向数据库添加机器人消息
    async appendAssistantMessage() {
        const message: NewMessage = {
            sessionId: this.sessionId,
            senderId: 'system-bot-id',
            content: '',
            status: 'sending',
            type: 'text',
        }

        return await db.transaction(async (tx) => {
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

    // 向数据库添加机器人消息
    async updateAssistantMessage(assistantMessage: SelectMessage, response: ApiResponse) {
        let result: SelectMessage[] = []
        const content = JSON.stringify(response)

        // TODO: 解析数据，根据里面的数据相对应的处理
        const otherAction = this.transformResponse(response)

        await db.transaction(async (tx) => {
            // 新增消息记录
            const [updatedMessage] = await tx.update(messages)
                .set({
                    content,
                    type: 'json',
                    status: 'success',
                })
                .where(eq(messages.id, assistantMessage.id))
                .returning()

            // 将服务返回的数据和解析出来的数据一同传递给sse
            const r = await otherAction()
            result = [updatedMessage, ...r]

            // 更新会话最新时间
            await tx.update(sessions)
                .set({ lastMessageAt: new Date() })
                .where(eq(sessions.id, assistantMessage.sessionId))
        })

        return result
    }

    // 向数据库添加用户消息
    async appendUserMessage(content: string): Promise<SelectMessage> {
        const message: NewMessage = {
            sessionId: this.sessionId,
            senderId: this.userId,
            content,
        }

        return await db.transaction(async (tx) => {
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
    static async getMessages(sessionId: string, limit = 20, offset = 0): Promise<SelectMessage[]> {
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

    // 解析由外部 YUTONG 服务传递过来的数据
    transformResponse(response: ApiResponse) {
        const fns: Array<() => Promise<SelectMessage>> = []
        if (!hasAnswer(response)) {
            if (response.intent.actions.includes('RAG_BUILD_INDEX')) {
                fns.push(
                    async () => {
                        const message: NewMessage = {
                            sessionId: this.sessionId,
                            senderId: 'system-bot-id',
                            content: 'Rag 构建',
                            type: 'text',
                        }
                        const [newMessage] = await db.insert(messages).values(message).returning()
                        return newMessage
                    },
                )
            }
        }

        return () => Promise.all(fns.map(el => el()))
    }

    async receiveResponseMessage(assistantMessage: SelectMessage, response: ApiResponse): Promise<SelectMessage[]> {
        return await this.updateAssistantMessage(assistantMessage, response)
    }

    // 创建新的会话
    async createSession(): Promise<SelectSession> {
        const session: NewSession = {
            title: `单聊-${Date.now()}`,
            isGroup: false,
            lastMessageAt: new Date(),
            createdAt: new Date(),
        }
        const [newSession] = await db.insert(sessions).values(session).returning()
        return newSession
    }

    // 查询指定会话
    async getSession() {
        const [session] = await db.select().from(sessions).where(eq(sessions.id, this.sessionId))
        return session
    }
}
