import type { SSEPayload } from 'elysia'
import Elysia, { sse, t } from 'elysia'
import { parsePipeline } from '../core'
import { db } from '../db'
import { SessionRepository } from '../repositories'
import { AuthService } from '../services/auth'
import { SessionService } from '../services/session'
import eventBus from '../utils/event-bus'

const sessionRepo = new SessionRepository(db)

export const sessionRoutes = new Elysia({ prefix: '/session' })
    .use(AuthService)
    .post('/chat/:sessionId?', async ({ body, user, params: { sessionId } }) => {
        const session = new SessionService(user.username, sessionId)
        await session.ensureSession()

        // 后台处理聊天，不阻塞响应
        processChat(session, body.text).catch((error) => {
            console.error('[Chat Error]', error)
        })

        return {
            sessionId: session.sessionId,
        }
    }, {
        params: t.Object({
            sessionId: t.Optional(t.String()),
        }),
        body: t.Object({
            text: t.String(),
            messageId: t.String(),
        }),
        auth: true,
    })
    .get('/chat/:sessionId', async ({ params: { sessionId } }) => {
        const session = await sessionRepo.findByIdWithMessages(sessionId)
        return session ?? { error: 'Session not found', messages: [], files: [] }
    }, {
        params: t.Object({
            sessionId: t.String(),
        }),
        detail: {
            tags: ['消息管理'],
            summary: '获取历史消息',
            description: '获取指定会话的历史消息列表，支持分页查询。',
        },
        auth: true,
    })
    .get('/chat', () => {
        return sessionRepo.findAll()
    }, {
        auth: true,
    })
    .get('/chat/sse/:sessionId', async function* ({ request, params: { sessionId } }) {
        yield sse({
            data: '',
            event: 'ready',
        })

        const queue: SSEPayload[] = []
        let resolvePromise: (() => void) | null = null

        const pushToStream = (event: string, data?: unknown) => {
            queue.push({
                data: typeof data === 'object' ? JSON.stringify(data) : String(data),
                event,
            })
            if (resolvePromise) {
                resolvePromise()
                resolvePromise = null
            }
        }

        const heartbeatInterval = setInterval(() => {
            pushToStream('heartbeat', 'ping')
        }, 3000)

        const onCustomEvent = (data: unknown) => {
            pushToStream('message', data)
        }
        eventBus.on(`chat-${sessionId}`, onCustomEvent)

        let isDisconnected = false
        request.signal.addEventListener('abort', () => {
            isDisconnected = true
            clearInterval(heartbeatInterval)
            eventBus.off(`chat-${sessionId}`, onCustomEvent)
            if (resolvePromise)
                resolvePromise()
        })

        try {
            // eslint-disable-next-line no-unmodified-loop-condition
            while (!isDisconnected) {
                if (queue.length === 0) {
                    await new Promise<void>((resolve) => {
                        resolvePromise = resolve
                    })
                }

                while (queue.length > 0) {
                    const msg = queue.shift()
                    if (msg) {
                        yield sse(msg)
                    }
                }
            }
        }
        finally {
            clearInterval(heartbeatInterval)
            eventBus.off(`chat-${sessionId}`, onCustomEvent)
        }
    }, {
        params: t.Object({
            sessionId: t.String(),
        }),
        auth: true,
    })

/**
 * 后台处理聊天流程
 * 1. 发送用户消息和助手占位消息
 * 2. 调用第三方接口获取响应
 * 3. 更新助手消息内容
 */
async function processChat(session: SessionService, text: string): Promise<void> {
    const [_, assistantMessage] = await session.chat(text)

    try {
        const result = await parsePipeline(session.sessionId, text)
        const updatedMessages = await session.receiveResponseMessage(assistantMessage, result.data)

        // 发送更新后的消息
        for (const message of updatedMessages) {
            eventBus.emit(`chat-${session.sessionId}`, message)
        }
    }
    catch (error) {
        // TODO: 更新助手消息状态为 'error'，通知客户端
        console.error('[ParsePipeline Error]', error)
        throw error
    }
}
