import type { GovernanceRag } from '../types/governance'
import type { RagAnswerResponse, RagBuildResponse } from '../types/rag'
import type { RagBuildParams } from '../types/response'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import Elysia, { sse, t } from 'elysia'
import { authPlugin } from '../plugins/auth'
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
            .post('/', () => {

            })
            .post('/rag/:sessionId', async ({ body, user, params: { sessionId } }) => {
                const session = new SessionService(user.name) // TODO:
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

                const data = await fetch('http://localhost:8002/api/data/governance/rag/build/from-files', {
                    method: 'POST',
                    body: formData,
                })
                    .then(res => res.json())
                    .then(data => data.data as GovernanceRag)

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
