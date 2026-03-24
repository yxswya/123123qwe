import type { NewMessage, NewModel, NewRag, NewTrain } from '../db/schema'
import type { GovernanceRagResponse, GovernanceResponse, GovernanceTrainResponse } from '../types/governance'
import Elysia, { t } from 'elysia'
import { AuthService } from '../services/auth'
import { FileService } from '../services/file'
import { SessionService } from '../services/session'
import eventBus from '../utils/event-bus'

// 默认配置
const DEFAULT_RAG_CFG = {
    backend: 'milvus',
    embedder: 'sentence-transformers/all-MiniLM-L6-v2',
    chunk: { size: 800, overlap: 120 },
}

const DEFAULT_TRAIN_CFG = {
    method: 'lora',
    base_model: 'facebook/opt-125m',
    epochs: 1,
    batch_size: 1,
    max_seq_len: 256,
}

// 配置类型定义
const RagCfgSchema = t.Optional(t.Object({
    backend: t.Optional(t.String()),
    embedder: t.Optional(t.String()),
    dim: t.Optional(t.Number()),
    metric: t.Optional(t.String()),
    chunk: t.Optional(t.Object({
        size: t.Number(),
        overlap: t.Number(),
    })),
}))

const TrainCfgSchema = t.Optional(t.Object({
    method: t.Optional(t.String()),
    base_model: t.Optional(t.String()),
    epochs: t.Optional(t.Number()),
    batch_size: t.Optional(t.Number()),
    max_seq_len: t.Optional(t.Number()),
}))

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
        const session = new SessionService(user.username, sessionId)
        await session.ensureSession()

        // 合并用户配置和默认配置
        const trainCfg = {
            method: body.train_cfg?.method ?? DEFAULT_TRAIN_CFG.method,
            base_model: body.train_cfg?.base_model ?? DEFAULT_TRAIN_CFG.base_model,
            epochs: body.train_cfg?.epochs ?? DEFAULT_TRAIN_CFG.epochs,
            batch_size: body.train_cfg?.batch_size ?? DEFAULT_TRAIN_CFG.batch_size,
            max_seq_len: body.train_cfg?.max_seq_len ?? DEFAULT_TRAIN_CFG.max_seq_len,
        }

        const ragCfg = {
            backend: body.rag_cfg?.backend ?? DEFAULT_RAG_CFG.backend,
            embedder: body.rag_cfg?.embedder ?? DEFAULT_RAG_CFG.embedder,
            dim: body.rag_cfg?.dim,
            metric: body.rag_cfg?.metric,
            chunk: body.rag_cfg?.chunk ?? DEFAULT_RAG_CFG.chunk,
        }

        // 阶段1：启动训练
        const msg: NewMessage = {
            sessionId: session.sessionId,
            senderId: 'system-bot-id',
            content: JSON.stringify({
                stage: 'model-train',
                trainStage: 1,
                status: 'pending',
                title: body.title,
                // 真实数据
                modelCode: trainCfg.base_model,
                method: trainCfg.method,
                architecture: 'Transformer',
            }),
            type: 'json',
        }
        const message = await session.appendAssistantMessage(msg)

        eventBus.emit(`chat-${sessionId}`, message)

        async function doWork() {
            // 阶段1 延迟 800ms
            await new Promise(resolve => setTimeout(resolve, 800))

            // 阶段2：训练中
            await session.updateTrainStage(message.id, 2, body.title, {
                modelCode: trainCfg.base_model,
                currentEpoch: 1,
                totalEpochs: trainCfg.epochs,
                progress: 30,
            })

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
                rag_cfg: ragCfg,
                train_cfg: trainCfg,
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

            // 训练完成后延迟 500ms
            await new Promise(resolve => setTimeout(resolve, 500))

            // 阶段3：训练完成
            const trainData = data.answer.train
            await session.updateTrainStage(message.id, 3, body.title, {
                modelCode: trainCfg.base_model,
                outputSize: trainData.artifacts.ckpt_uri?.split('/').pop() || '-',
                fileLocation: trainData.artifacts.ckpt_uri,
                accuracy: trainData.metrics?.eval_accuracy_estimated,
                ragIndex: data.answer.rag?.artifacts?.index_version || '-',
                elapsedMs: trainData.elapsed_ms,
            })

            // 存储训练结果，包含 ckpt_id 和 ckpt_uri
            const newTrain: NewTrain = {
                sessionId: session.sessionId,
                content: JSON.stringify(data),
                title: body.title,
                messageId: message.id,
                ckptId: trainData.artifacts.ckpt_id,
                ckptUri: trainData.artifacts.ckpt_uri,
            }

            const { trainId } = await session.appendTrain(newTrain)

            // 训练完成后，主动调用注册接口注册模型
            if (trainData.artifacts.ckpt_uri && trainId) {
                // 延迟 500ms
                await new Promise(resolve => setTimeout(resolve, 500))

                // 阶段4：注册中
                await session.updateTrainStage(message.id, 4, body.title, {
                    modelCode: trainCfg.base_model,
                    targetRegistry: '模型中心',
                    ragIndex: data.answer.rag?.artifacts?.index_version || '-',
                })

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

                        await session.appendModel(newModel)

                        // 延迟 500ms
                        await new Promise(resolve => setTimeout(resolve, 500))

                        // 阶段5：注册成功
                        await session.updateTrainStage(message.id, 5, body.title, {
                            modelId: registeredModel.id,
                            version: 'v1.0.0',
                            inferEndpoint: `/api/v1/models/${registeredModel.id}/infer`,
                            fileSize: registeredModel.file_size,
                            existsLocal: registeredModel.exists_local,
                        })
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
            rag_cfg: RagCfgSchema,
            train_cfg: TrainCfgSchema,
        }),
        params: t.Object({
            sessionId: t.String(),
        }),
        auth: true,
    })
