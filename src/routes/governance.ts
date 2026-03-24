import type { NewMessage, NewModel, NewRag, NewTrain } from '../db/schema'
import type { GovernanceRagResponse, GovernanceResponse, GovernanceTrainResponse } from '../types/governance'
import Elysia, { t } from 'elysia'
import { AuthService } from '../services/auth'
import { FileService } from '../services/file'
import { SessionService } from '../services/session'
import eventBus from '../utils/event-bus'

export const governanceRoutes = new Elysia({ prefix: '/governance' })
    .use(AuthService)
    .post('/:sessionId', async ({ body, user, params: { sessionId } }) => {
        if (!sessionId)
            return []

        const session = new SessionService(user.username, sessionId)
        await session.ensureSession()

        const files = body.files as File[] | File
        const fileArray = Array.isArray(files) ? files : [files]

        const formData = new FormData()
        for (const file of fileArray) {
            formData.append('files', file)
        }

        formData.append('task_type', 'rag')

        const data = await fetch(`${process.env.LLM_SERVER}/governance/process/batch/enhanced`, {
            method: 'POST',
            body: formData,
        })
            .then(res => res.json())
            .then((data) => {
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
        auth: true,
    })
    .post('/rag/:sessionId', async ({ body, user, params: { sessionId } }) => {
        const session = new SessionService(user.username, sessionId) // TODO:
        await session.ensureSession()

        const msg: NewMessage = {
            sessionId: session.sessionId,
            senderId: 'system-bot-id',
            content: JSON.stringify({
                stage: 'rag-build-index',
                status: 'pending',
                title: body.title,
            }),
            type: 'json',
        }
        const message = await session.appendAssistantMessage(msg)

        eventBus.emit(`chat-${sessionId}`, message)

        async function doo() {
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

            const data = await fetch(`${process.env.LLM_SERVER}/data/governance/rag/build/from-files`, {
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
                message.id,
            )

            const newRag: NewRag = {
                sessionId: session.sessionId,
                indexVersion: data.answer.rag.artifacts.index_version,
                content: JSON.stringify(data),
                title: body.title,
                messageId: message.id,
            }

            const newMessage = await session.appendRag(newRag)
            eventBus.emit(`chat-${sessionId}`, newMessage)
        }

        doo()

        return {
            message: 'success',
        }
    }, {
        body: t.Object({
            files: t.Files({
                minItems: 1,
            }),
            message_id: t.String(),
            title: t.String(),
        }),
        params: t.Object({
            sessionId: t.String(),
        }),
        auth: true,
    })
    .post('/train/:sessionId', async ({ body, user, params: { sessionId } }) => {
        const session = new SessionService(user.username, sessionId) // TODO:
        await session.ensureSession()

        const msg: NewMessage = {
            sessionId: session.sessionId,
            senderId: 'system-bot-id',
            content: JSON.stringify({
                stage: 'model-train',
                status: 'pending',
                title: body.title,
            }),
            type: 'json',
        }
        const message = await session.appendAssistantMessage(msg)

        eventBus.emit(`chat-${sessionId}`, message)

        async function doWork() {
            const files = body.files as File[] | File
            const fileArray = Array.isArray(files) ? files : [files]

            const formData = new FormData()
            const datasetFileMetas = []
            for (const file of fileArray) {
                formData.append('dataset_files', file)
                datasetFileMetas.push({
                    name: file.name,
                    description: `${file.name}-知识库文档`,
                    task_type: 'rag',
                    intended_use: '知识库检索',
                })
            }
            formData.append('body', JSON.stringify({
                dataset_file_metas: datasetFileMetas,
                rag_cfg: {
                    backend: 'milvus',
                    embedder: 'sentence-transformers/all-MiniLM-L6-v2',
                    chunk: { size: 800, overlap: 120 },
                },
                train_cfg: {
                    method: 'lora',
                    base_model: 'facebook/opt-125m',
                    epochs: 1,
                    batch_size: 1,
                    max_seq_len: 256,
                },
                extra_dataset_ids: ['datasets/other_docs'],
            }))

            const data = await fetch(`${process.env.LLM_SERVER}/data/governance/rag/train/from-files`, {
                method: 'POST',
                body: formData,
            })
                .then(res => res.json())
                .then((res) => {
                    console.log(res)
                    return res
                })
                .then(data => data.data as GovernanceTrainResponse)

            console.log('data', data)

            // 存储训练结果，包含 ckpt_id 和 ckpt_uri
            const trainData = data.answer.train
            const newTrain: NewTrain = {
                sessionId: session.sessionId,
                content: JSON.stringify(data),
                title: body.title,
                messageId: message.id,
                ckptId: trainData.artifacts.ckpt_id,
                ckptUri: trainData.artifacts.ckpt_uri,
            }

            const { message: newMessage, trainId } = await session.appendTrain(newTrain)
            console.log('newMessage', newMessage)
            eventBus.emit(`chat-${sessionId}`, newMessage)

            // 训练完成后，主动调用注册接口注册模型
            if (trainData.artifacts.ckpt_uri && trainId) {
                try {
                    const registerResponse = await fetch(`${process.env.LLM_SERVER}/exec/train/model/use`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            model_uri: trainData.artifacts.ckpt_uri,
                            task: 'chat',
                            model_type: 'causal-lm',
                            note: body.title,
                        }),
                    })
                        .then(res => res.json())

                    console.log('registerResponse', registerResponse)

                    if (registerResponse.code === 0 && registerResponse.data?.answer) {
                        const registeredModel = registerResponse.data.answer
                        const newModel: NewModel = {
                            sessionId: session.sessionId,
                            messageId: message.id,
                            trainId,
                            externalId: registeredModel.id,
                            modelUri: registeredModel.model_uri,
                            task: registeredModel.task,
                            modelType: registeredModel.model_type,
                            note: registeredModel.note,
                            existsLocal: registeredModel.exists_local,
                            fileSize: registeredModel.file_size,
                            mtime: registeredModel.mtime,
                            externalCreatedAt: registeredModel.created_at,
                        }

                        const modelMessage = await session.appendModel(newModel)
                        eventBus.emit(`chat-${sessionId}`, modelMessage)
                    }
                }
                catch (err) {
                    console.error('注册模型失败:', err)
                }
            }
        }

        doWork()

        return {
            message: 'success',
        }
    }, {
        body: t.Object({
            files: t.Files({
                minItems: 1,
            }),
            message_id: t.String(),
            title: t.String(),
        }),
        params: t.Object({
            sessionId: t.String(),
        }),
        auth: true,
    })
