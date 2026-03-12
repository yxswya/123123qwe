import type { ApiResponse, Success } from '../types/response'
import Elysia, { sse, t } from 'elysia'
import { authPlugin } from '../plugins/auth'
import { SessionService } from '../services/session'

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
            async function* ({ body, user, params: { sessionId } }) {
                if (!sessionId) {
                    sessionId = ''
                }
                console.log(user)
                console.log(sessionId)
                console.log(body.text)

                // 【核心变化 2】：使用 yield sse() 推送数据
                yield sse({
                    event: 'status',
                    data: '已连接网关，正在唤醒 Python 层...',
                })

                const session = new SessionService(user.name) // TODO:
                await session.initialize(sessionId)
                console.log(session.sessionId)
                const [userMessage, assistantMessage] = await session.chat(body.text)

                // 用户信息
                yield sse({
                    event: 'result',
                    data: userMessage,
                })

                // 机器人加载信息
                yield sse({
                    event: 'result',
                    data: assistantMessage,
                })

                try {
                    // 1. 发起对 Python 阻塞接口的请求
                    const fetchPromise = fetch('http://localhost:8002/api/parse/pipeline', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            session_id: session.sessionId,
                            text: body.text,
                            content: body.text,
                            run_quality_check: false,
                        }),
                    })

                    let isPythonDone = false
                    let pyResponse: Response | null = null

                    // 2. 优雅的心跳循环：在等待期间，利用 Promise.race 竞速机制
                    while (!isPythonDone) {
                        // 竞速：要么 Python 返回了，要么 3 秒超时触发心跳
                        const raceResult = await Promise.race([
                            fetchPromise.then(res => ({ type: 'done', res })),
                            new Promise<{ type: 'heartbeat' }>(resolve =>
                                setTimeout(resolve, 3000, { type: 'heartbeat' }),
                            ),
                        ])

                        if (raceResult.type === 'heartbeat') {
                            // 如果 3 秒到了 Python 还没返回，推一个心跳包安抚前端并保活连接
                            yield sse({
                                event: 'heartbeat',
                                data: 'AI 正在深度思考中，请稍候...',
                            })
                        }
                        else {
                            // Python 终于返回了，跳出循环
                            isPythonDone = true
                            pyResponse = (raceResult as { type: string, res: Response }).res
                        }
                    }

                    // 3. 处理 Python 的返回结果
                    if (!pyResponse!.ok)
                        throw new Error(`Python 返回错误: ${pyResponse!.status}`)
                    const pyData = await pyResponse!.json() as Success<ApiResponse>
                    const datas = await session.receiveResponseMessage(assistantMessage, pyData.data)

                    for (let i = 0; i < datas.length; i++) {
                        // 4. 将最终完整的结果推给前端
                        yield sse({
                            event: 'result',
                            // 假设 Python 返回了 {"data": "..."}
                            data: datas[i],
                        })
                    }
                }
                catch (error: any) {
                    yield sse({
                        event: 'error',
                        data: error.message,
                    })
                }

                // 【核心变化 3】：不再需要手动 stream.close()，函数执行结束（return），Elysia 自动关闭流
            }, {
                params: t.Object({
                    sessionId: t.Optional(t.String()),
                }),
                body: t.Object({
                    text: t.String(),
                    messageId: t.String(),
                }),
            })
        .get('/chat/:sessionId', async ({ params: { sessionId }, query }) => {
            const limit = query.limit || 20
            const offset = query.offset || 0

            return SessionService.getMessages(sessionId, limit, offset)
        }, {
            params: t.Object({
                sessionId: t.String(),
            }),
            query: t.Object({
                limit: t.Optional(t.Numeric()),
                offset: t.Optional(t.Numeric()),
            }),
            detail: {
                tags: ['消息管理'],
                summary: '获取历史消息',
                description: '获取指定会话的历史消息列表，支持分页查询。',
            },
        }))
