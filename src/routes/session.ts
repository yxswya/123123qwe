import type { SSEPayload } from 'elysia'
import Elysia, { sse, t } from 'elysia'
import { authPlugin } from '../plugins/auth'
import { SessionService } from '../services/session'

import eventBus from '../utils/event-bus'

export const sessionRoutes = new Elysia({ prefix: '/session' })
    .use(authPlugin)
    .guard({
        beforeHandle: ({ user, set }) => {
            if (!user) {
                set.status = 401
                return { error: 'Unauthorized' }
            }
        },
    }, app => app
        // 以下所有路由受到 guard 保护
        .post('/chat/:sessionId?',
            // 【核心变化 1】：直接将处理函数声明为异步生成器 (async function*)
            async ({ body, user, params: { sessionId } }) => {
                if (!sessionId) {
                    sessionId = ''
                }

                const session = new SessionService(user.username)
                await session.initialize(sessionId)

                async function doo() {
                    const [userMessage, assistantMessage] = await session.chat(body.text)

                    eventBus.emit(`chat-${sessionId}`, userMessage)
                    eventBus.emit(`chat-${sessionId}`, assistantMessage)

                    const result = await fetch(`${process.env.LLM_SERVER}/parse/pipeline`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            session_id: session.sessionId,
                            text: body.text,
                            content: body.text,
                            run_quality_check: false,
                        }),
                    }).then(res => res.json())

                    const newMessage = await session.receiveResponseMessage(assistantMessage, result.data)
                    eventBus.emit(`chat-${session.sessionId}`, newMessage)
                }

                doo()

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
            })
        .get('/chat/:sessionId', async ({ params: { sessionId } }) => {
            return SessionService.getSessionById(sessionId)
        }, {
            params: t.Object({
                sessionId: t.String(),
            }),
            detail: {
                tags: ['消息管理'],
                summary: '获取历史消息',
                description: '获取指定会话的历史消息列表，支持分页查询。',
            },
        })
        .get('/chat', () => {
            return SessionService.getAllSession()
        })
        .get('/chat/sse/:sessionId', async function* ({ request, params: { sessionId } }) {
            yield sse({
                data: '',
                event: 'ready',
            })

            const queue: SSEPayload[] = []
            let resolvePromise: (() => void) | null = null

            const pushToStream = (event: string, data?: any) => {
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

            const onCustomEvent = (data: any) => {
                pushToStream('message', data)
            }
            eventBus.on(`chat-${sessionId}`, onCustomEvent)

            let isDisconnected = false
            request.signal.addEventListener('abort', () => {
                isDisconnected = true
                clearInterval(heartbeatInterval)
                eventBus.off(`chat-${sessionId}`, onCustomEvent)
                // 唤醒并退出生成器死循环
                if (resolvePromise)
                    resolvePromise()
            })

            try {
                // eslint-disable-next-line no-unmodified-loop-condition
                while (!isDisconnected) {
                    // 如果队列为空，则挂起阻塞，直到有新事件触发 pushToStream
                    if (queue.length === 0) {
                        await new Promise<void>((resolve) => {
                            resolvePromise = resolve
                        })
                    }

                    // 依次吐出累积的消息
                    while (queue.length > 0) {
                        const msg = queue.shift()
                        if (msg) {
                            yield sse(msg)
                        }
                    }
                }
            }
            finally {
                // 防御性清理（即使因为其他异常跳出，也能确保释放资源）
                clearInterval(heartbeatInterval)
                eventBus.off(`chat-${sessionId}`, onCustomEvent)
            }
        }, {
            params: t.Object({
                sessionId: t.String(),
            }),
        }))
