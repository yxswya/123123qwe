import type { NewMessage, NewModel, NewRag, NewTrain } from '../db/schema'
import type { RagConfig } from '../services/governance'
// import type { GovernanceResponse } from '../types/governance'
import Elysia, { t } from 'elysia'
import { governanceData } from '../core'
import { AuthPlugin } from '../plugins/auth'
import { SessionPlugin } from '../plugins/session'
import { FileService } from '../services/file'
import { governanceService } from '../services/governance'
import { appendAssistantMessage, SessionService } from '../services/session'
import eventBus from '../utils/event-bus'

// 默认配置
const DEFAULT_RAG_CFG: RagConfig = {
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

/**
 * 将文件列表转换为数组
 */
function fileToArray(files: File[] | File): File[] {
    return Array.isArray(files) ? files : [files]
}

export const governanceRoutes = new Elysia({ prefix: '/governance' })
    .use(SessionPlugin)

    .post('/:sessionId', async ({ body, session }) => {
        const data = await governanceData(body.files, 'rag')

        Bun.write(`./governance-${Date.now()}.json`, JSON.stringify(data, null, 2))

        const promises = data.success.map((el) => {
            // 将 governance 数组转换为 JSONL 格式（每行一个 JSON 对象）
            const governanceJsonl = el.result.documents.map(item => JSON.stringify(item)).join('\n')
            const governanceFileName = data.filename_mapping[el.file] || `governance-${Date.now()}.jsonl`

            // 保存文件并记录到数据库
            const fileService = new FileService(session.id)
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
        // session: true,
    })

    .post('/rag/:sessionId', async ({ body, params: { sessionId }, session }) => {
        // 创建初始消息
        const msg: NewMessage = {
            sessionId: session.id,
            senderId: 'system-bot-id',
            content: JSON.stringify({
                stage: 'rag-build-index',
                status: 'pending',
                title: body.title,
            }),
            type: 'json',
        }
        const message = await appendAssistantMessage(session, msg)

        eventBus.emit(`chat-${sessionId}`, message)

        // 异步执行 RAG 构建
        async function executeRagBuild() {
            const fileArray = fileToArray(body.files as File[] | File)

            // 构建文件元信息
            const datasetFileMetas = fileArray.map(file => ({
                name: file.name,
                description: `${file.name}-知识库文档`,
                task_type: 'rag',
            }))

            // 构建配置
            const ragCfg: RagConfig = {
                backend: 'pgvector',
                embedder: 'sentence-transformers/all-MiniLM-L6-v2',
                dim: 384,
                metric: 'cosine',
                chunk: { size: 512, overlap: 64 },
            }

            // 构建 FormData
            const formData = governanceService.buildFormData(fileArray, datasetFileMetas, ragCfg)

            // 调用 RAG 构建接口
            const data = await governanceService.buildRagFromFiles(formData)

            // 存储结果（治理文件 + RAG 记录）
            await governanceService.storeRagResult(data, session, message.id, body.title, sessionId)
        }

        executeRagBuild()

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

    .post('/train/:sessionId', async ({ body, params: { sessionId }, session }) => {
        // 合并用户配置和默认配置
        const trainCfg = {
            method: body.train_cfg?.method ?? DEFAULT_TRAIN_CFG.method,
            base_model: body.train_cfg?.base_model ?? DEFAULT_TRAIN_CFG.base_model,
            epochs: body.train_cfg?.epochs ?? DEFAULT_TRAIN_CFG.epochs,
            batch_size: body.train_cfg?.batch_size ?? DEFAULT_TRAIN_CFG.batch_size,
            max_seq_len: body.train_cfg?.max_seq_len ?? DEFAULT_TRAIN_CFG.max_seq_len,
        }

        const ragCfg: RagConfig = {
            backend: body.rag_cfg?.backend ?? DEFAULT_RAG_CFG.backend,
            embedder: body.rag_cfg?.embedder ?? DEFAULT_RAG_CFG.embedder,
            dim: body.rag_cfg?.dim,
            metric: body.rag_cfg?.metric,
            chunk: body.rag_cfg?.chunk ?? DEFAULT_RAG_CFG.chunk,
        }

        // 阶段1：启动训练
        const msg: NewMessage = {
            sessionId: session.id,
            senderId: 'system-bot-id',
            content: JSON.stringify({
                stage: 'model-train',
                trainStage: 1,
                status: 'pending',
                title: body.title,
                modelCode: trainCfg.base_model,
                method: trainCfg.method,
                architecture: 'Transformer',
            }),
            type: 'json',
        }
        const message = await appendAssistantMessage(session, msg)

        // 异步执行训练流程
        async function executeTrainWorkflow() {
            // 阶段1 延迟 800ms
            await new Promise(resolve => setTimeout(resolve, 800))

            // 阶段2：训练中
            await session.updateTrainStage(message.id, 2, body.title, {
                modelCode: trainCfg.base_model,
                currentEpoch: 1,
                totalEpochs: trainCfg.epochs,
                progress: 30,
            })

            // 构建请求
            const fileArray = fileToArray(body.files as File[] | File)
            const datasetFileMetas = fileArray.map(file => ({
                name: file.name,
                description: `${file.name}-知识库文档`,
                task_type: 'rag',
                intended_use: '知识库检索',
            }))

            const formData = governanceService.buildFormData(fileArray, datasetFileMetas, ragCfg, trainCfg)

            // 调用训练接口
            const data = await governanceService.trainFromFiles(formData)

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

            // 存储治理文件和 RAG 记录（与 /rag/:sessionId 相同的逻辑）
            if (data.answer.governance && data.answer.governance.length > 0) {
                await governanceService.saveGovernanceFile(
                    data.answer.governance,
                    sessionId,
                    message.id,
                )
            }

            // 存储 RAG 记录
            let ragId: string | null = null
            if (data.answer.rag) {
                const newRag: NewRag = {
                    indexVersion: data.answer.rag.artifacts.index_version,
                    content: JSON.stringify({
                        rag: data.answer.rag,
                        governance: data.answer.governance,
                    }),
                    title: `${body.title} - RAG`,
                    messageId: message.id,
                }
                ragId = await session.insertRag(newRag)
            }

            // 存储训练结果
            const newTrain: NewTrain = {
                content: JSON.stringify(data),
                title: body.title,
                messageId: message.id,
                ckptId: trainData.artifacts.ckpt_id,
                ckptUri: trainData.artifacts.ckpt_uri,
                ragId, // 关联 RAG
            }

            const { trainId } = await session.appendTrain(newTrain)

            // 训练完成后，注册模型
            if (trainData.artifacts.ckpt_uri && trainId) {
                // 阶段4：注册中
                await session.updateTrainStage(message.id, 4, body.title, {
                    modelCode: trainCfg.base_model,
                    targetRegistry: '模型中心',
                    ragIndex: data.answer.rag?.artifacts?.index_version || '-',
                })

                // 注册模型
                const registerResult = await governanceService.registerModel(
                    trainData.artifacts.ckpt_uri,
                    body.title,
                )

                if (registerResult.success && registerResult.data) {
                    const registeredModel = registerResult.data
                    const newModel: NewModel = {
                        messageId: message.id,
                        title: `模型：${body.title}`,
                        trainId,
                        ragId, // 关联 RAG
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
        }

        executeTrainWorkflow()

        return { message: 'success' }
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
