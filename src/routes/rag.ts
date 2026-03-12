import type { RagAnswerResponse, RagBuildResponse } from '../types/rag'
import type { RagBuildParams } from '../types/response'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import Elysia, { sse, t } from 'elysia'
import { authPlugin } from '../plugins/auth'
import { SessionService } from '../services/session'

// 2MB 阈值 区分同步或异步的阈值
const SIZE_THRESHOLD = 2 * 1024 * 1024

export const ragRoutes = new Elysia({ prefix: '/rag' })
    .use(authPlugin)
    .guard({
        beforeHandle: ({ user, set }) => {
            if (!user) {
                set.status = 401
                return { error: 'Unauthorized' }
            }
        },
    }, app => app
        .post(
            '/build/:sessionId',
            async function* ({ body, params: { sessionId }, user }) {
            // 将文件路径转换为完整路径并计算总大小
                const filePaths = body.file_paths.map(p => path.join(path.resolve(), p))
                let totalSize = 0

                // 计算所有文件的总大小
                for (const filePath of filePaths) {
                    try {
                        const stats = await stat(filePath)
                        totalSize += stats.size
                    }
                    catch (error) {
                        console.error(`Failed to get file size for ${filePath}:`, error)
                    }
                }

                console.log(`Total file size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`)
                console.log(totalSize > SIZE_THRESHOLD)
                yield sse({
                    event: 'status',
                    data: `文件总大小为: ${(totalSize / 1024 / 1024).toFixed(2)} MB，采用同步构建`,
                })

                const ragParams: RagBuildParams = {
                    rag_cfg: {
                        backend: 'file',
                        embedder: 'sentence-transformers/all-MiniLM-L6-v2',
                    },
                    dataset_ids: filePaths,
                }

                yield sse({
                    event: 'init',
                    data: `开始同步构建`,
                })

                const session = new SessionService(user.name) // TODO:
                await session.initialize(sessionId)
                try {
                // 1. 发起对 Python 阻塞接口的请求
                    const fetchPromise = fetch('http://localhost:8002/api/exec/rag/build', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(ragParams),
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
                                data: 'AI 正在构建文档中，请稍候...',
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
                    const pyData = await pyResponse!.json()
                    const data = pyData.data as RagBuildResponse
                    console.log(data)

                    const result = await session.appendRag(
                        body.message_id,
                        data.answer.artifacts.index_version,
                        JSON.stringify(data),
                    )

                    yield sse({
                        event: 'result',
                        // 假设 Python 返回了 {"data": "..."}
                        data: result,
                    })
                }
                catch (error: any) {
                    yield sse({
                        event: 'error',
                        data: error.message,
                    })
                }
            },
            {
                body: t.Object({
                    file_paths: t.Array(t.String()),
                    message_id: t.String(),
                }),
                params: t.Object({
                    sessionId: t.String(),
                }),
            },
        )
        .post('/chat/:index_version', async ({ params: { index_version }, body }) => {
            const result = await fetch('http://localhost:8002/api/exec/rag/answer', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: body.text,
                    index_version,
                    top_k: 5,
                }),
            }).then(res => res.json())

            return result.data as RagAnswerResponse
        }, {
            params: t.Object({
                index_version: t.String(),
            }),
            body: t.Object({
                text: t.String({}),
            }),
        }))
