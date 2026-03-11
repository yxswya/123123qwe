import Elysia, { sse, t } from 'elysia'
import { authPlugin } from '../plugins/auth'

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
        .post('/chat',
            // 【核心变化 1】：直接将处理函数声明为异步生成器 (async function*)
            async function* ({ body }) {
                console.log(body.sessionId)
                console.log(body.text)
                console.log(body.content)
                // 【核心变化 2】：使用 yield sse() 推送数据
                yield sse({
                    event: 'status',
                    data: '已连接网关，正在唤醒 Python 层...',
                })

                try {
                    // 1. 发起对 Python 阻塞接口的请求
                    const fetchPromise = fetch('http://localhost:8002/api/parse/pipeline', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            session_id: body.sessionId || '',
                            text: body.text,
                            content: body.content,
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
                            console.log('raceResult', raceResult)
                            // Python 终于返回了，跳出循环
                            isPythonDone = true
                            pyResponse = (raceResult as { type: string, res: Response }).res
                        }
                    }

                    // 3. 处理 Python 的返回结果
                    if (!pyResponse!.ok)
                        throw new Error(`Python 返回错误: ${pyResponse!.status}`)
                    const pyData = await pyResponse!.json()

                    // 4. 将最终完整的结果推给前端
                    yield sse({
                        event: 'result',
                        // 假设 Python 返回了 {"data": "..."}
                        data: pyData.data,
                    })
                }
                catch (error: any) {
                    yield sse({
                        event: 'error',
                        data: error.message,
                    })
                }

                // 【核心变化 3】：不再需要手动 stream.close()，函数执行结束（return），Elysia 自动关闭流
            }, {
                body: t.Object({
                    text: t.String(),
                    content: t.String(),
                    sessionId: t.String(),
                    messageId: t.String(),
                }),
            }))
