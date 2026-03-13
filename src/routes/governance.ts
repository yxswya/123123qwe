import type { GovernanceRagResponse, GovernanceResponse } from '../types/governance'
import type { RagAnswerResponse, RagBuildResponse } from '../types/rag'
import type { RagBuildParams } from '../types/response'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import Elysia, { sse, t } from 'elysia'
import { authPlugin } from '../plugins/auth'
import { FileService } from '../services/file'
import { SessionService } from '../services/session'

export const governanceRoutes = new Elysia({ prefix: '/governance' })
    .use(authPlugin)
    .guard({
        beforeHandle: ({ user, set }) => {
            if (!user) {
                set.status = 401
                return { error: 'Unauthorized' }
            }
        },
    }, app =>
        app
            .post('/:sessionId', async ({ body, user, params: { sessionId } }) => {
                if (!sessionId)
                    return []

                const session = new SessionService(user.username)
                await session.initialize(sessionId)

                const files = body.files as File[] | File
                const fileArray = Array.isArray(files) ? files : [files]

                const formData = new FormData()
                for (const file of fileArray) {
                    formData.append('files', file)
                }

                formData.append('task_type', 'rag')

                const data = await fetch('http://192.168.20.131:8002/api/governance/process/batch/enhanced', {
                    method: 'POST',
                    body: formData,
                })
                    .then(res => res.json())
                    .then((data) => {
                        console.log(data)
                        return data as GovernanceResponse
                    })

                const promises = data.success.map((el) => {
                    // 将 governance 数组转换为 JSONL 格式（每行一个 JSON 对象）
                    const governanceJsonl = el.result.documents.map(item => JSON.stringify(item)).join('\n')
                    const governanceFileName = data.filename_mapping[el.file] || `governance-${Date.now()}.jsonl`

                    // 保存文件并记录到数据库
                    const fileService = new FileService(sessionId)
                    return fileService.saveFile(
                        governanceJsonl,
                        governanceFileName,
                        body.message_id,
                    )
                })

                return Promise.all(promises)
            }, {
                body: t.Object({
                    files: t.Files({
                        minItems: 1,
                    }),
                    message_id: t.Optional(t.String()),
                }),
                params: t.Object({
                    sessionId: t.String(),
                }),
            })
            .post('/rag/:sessionId', async ({ body, user, params: { sessionId } }) => {
                const session = new SessionService(user.username) // TODO:
                await session.initialize(sessionId)

                const files = body.files as File[] | File
                const fileArray = Array.isArray(files) ? files : [files]

                const formData = new FormData()
                const datasetFileMetas = []
                for (const file of fileArray) {
                    formData.append('dataset_files', file)
                    datasetFileMetas.push({ name: file.name, description: `${file.name}-知识库文档`, task_type: 'rag' })
                }
                formData.append('body', JSON.stringify({
                    rag_cfg: {
                        backend: 'pgvector',
                        embedder: 'sentence-transformers/all-MiniLM-L6-v2',
                        dim: 384,
                        metric: 'cosine',
                        chunk: { size: 512, overlap: 64 },
                    },
                    dataset_file_metas: datasetFileMetas,
                }))

                const data = await fetch('http://192.168.20.131:8002/api/data/governance/rag/build/from-files', {
                    method: 'POST',
                    body: formData,
                })
                    .then(res => res.json())
                    .then(data => data.data as GovernanceRagResponse)

                // 将 governance 数组转换为 JSONL 格式（每行一个 JSON 对象）
                const governanceJsonl = data.answer.governance.map(item => JSON.stringify(item)).join('\n')

                // 保存文件并记录到数据库
                const fileService = new FileService(sessionId)
                await fileService.saveFile(
                    governanceJsonl,
                    `governance-${Date.now()}.jsonl`,
                    body.message_id,
                )

                const result = await session.appendRag(
                    body.message_id,
                    data.answer.rag.artifacts.index_version,
                    JSON.stringify(data),
                )

                return result
            }, {
                body: t.Object({
                    files: t.Files({
                        minItems: 1,
                    }),
                    message_id: t.String(),
                }),
                params: t.Object({
                    sessionId: t.String(),
                }),
            })
            .post('/train', () => {

            }))
