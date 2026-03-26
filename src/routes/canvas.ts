import Elysia, { t } from 'elysia'
import { db } from '../db'
import { files, messages, models, rags, sessions, trains } from '../db/schema'
import { AuthPlugin } from '../plugins/auth'
import { eq } from 'drizzle-orm'

export interface CanvasNode {
    id: string
    type: 'session' | 'rag' | 'model' | 'train' | 'file'
    title: string
    data: Record<string, any>
    createdAt: Date | null
}

export interface CanvasEdge {
    id: string
    source: string
    target: string
    type: 'produces' | 'trains' | 'registers' | 'contains'
    label?: string
}

export interface CanvasGraph {
    nodes: CanvasNode[]
    edges: CanvasEdge[]
}

export const canvasRoutes = new Elysia({ prefix: '/canvas' })
    .use(AuthPlugin)
    .get('/graph/:sessionId', async ({ params: { sessionId } }) => {
        const nodes: CanvasNode[] = []
        const edges: CanvasEdge[] = []

        // 1. 获取会话信息
        const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId))
        if (!session) {
            return { code: 404, message: 'Session not found', data: null }
        }

        nodes.push({
            id: session.id,
            type: 'session',
            title: session.title || `会话 ${session.id.slice(0, 8)}`,
            data: {
                userId: session.userId,
                lastMessageAt: session.lastMessageAt,
            },
            createdAt: session.createdAt,
        })

        // 2. 获取 RAG 记录（通过 messages 表关联）
        const ragRecords = await db.select({ rag: rags })
            .from(rags)
            .innerJoin(messages, eq(rags.messageId, messages.id))
            .where(eq(messages.sessionId, sessionId))
            .then(rows => rows.map(row => row.rag))

        for (const rag of ragRecords) {
            nodes.push({
                id: rag.id,
                type: 'rag',
                title: rag.title,
                data: {
                    indexVersion: rag.indexVersion,
                    messageId: rag.messageId,
                },
                createdAt: rag.createdAt,
            })

            edges.push({
                id: `${session.id}-${rag.id}`,
                source: session.id,
                target: rag.id,
                type: 'produces',
                label: 'RAG',
            })
        }

        // 3. 获取训练记录（通过 messages 表关联）
        const trainRecords = await db.select({ train: trains })
            .from(trains)
            .innerJoin(messages, eq(trains.messageId, messages.id))
            .where(eq(messages.sessionId, sessionId))
            .then(rows => rows.map(row => row.train))

        for (const train of trainRecords) {
            nodes.push({
                id: train.id,
                type: 'train',
                title: train.title,
                data: {
                    ckptId: train.ckptId,
                    ckptUri: train.ckptUri,
                    ragId: train.ragId,
                },
                createdAt: train.createdAt,
            })

            edges.push({
                id: `${session.id}-${train.id}`,
                source: session.id,
                target: train.id,
                type: 'trains',
                label: '训练',
            })

            // 连接到关联的 RAG
            if (train.ragId) {
                edges.push({
                    id: `${train.ragId}-${train.id}`,
                    source: train.ragId,
                    target: train.id,
                    type: 'produces',
                    label: '使用',
                })
            }
        }

        // 4. 获取模型记录（通过 messages 表关联）
        const modelRecords = await db.select({ model: models })
            .from(models)
            .innerJoin(messages, eq(models.messageId, messages.id))
            .where(eq(messages.sessionId, sessionId))
            .then(rows => rows.map(row => row.model))

        for (const model of modelRecords) {
            nodes.push({
                id: model.id,
                type: 'model',
                title: model.note || model.externalId,
                data: {
                    externalId: model.externalId,
                    modelUri: model.modelUri,
                    task: model.task,
                    modelType: model.modelType,
                    trainId: model.trainId,
                    ragId: model.ragId,
                },
                createdAt: model.createdAt,
            })

            edges.push({
                id: `${session.id}-${model.id}`,
                source: session.id,
                target: model.id,
                type: 'registers',
                label: '模型',
            })

            // 连接到训练记录
            if (model.trainId) {
                edges.push({
                    id: `${model.trainId}-${model.id}`,
                    source: model.trainId,
                    target: model.id,
                    type: 'registers',
                    label: '产出',
                })
            }

            // 连接到关联的 RAG
            if (model.ragId) {
                edges.push({
                    id: `${model.ragId}-${model.id}`,
                    source: model.ragId,
                    target: model.id,
                    type: 'produces',
                    label: '关联',
                })
            }
        }

        // 5. 获取文件记录
        const fileRecords = await db.select().from(files).where(eq(files.sessionId, sessionId))

        for (const file of fileRecords) {
            nodes.push({
                id: file.id,
                type: 'file',
                title: file.fileName,
                data: {
                    fileUrl: file.fileUrl,
                },
                createdAt: file.createdAt,
            })

            edges.push({
                id: `${session.id}-${file.id}`,
                source: session.id,
                target: file.id,
                type: 'contains',
                label: '文件',
            })
        }

        return {
            code: 0,
            message: 'OK',
            data: { nodes, edges } as CanvasGraph,
        }
    }, {
        params: t.Object({
            sessionId: t.String(),
        }),
        auth: true,
    })
    .get('/graph', async () => {
        // 获取所有会话的图谱概览
        const allSessions = await db.select().from(sessions)
        const nodes: CanvasNode[] = []
        const edges: CanvasEdge[] = []

        for (const session of allSessions) {
            nodes.push({
                id: session.id,
                type: 'session',
                title: session.title || `会话 ${session.id.slice(0, 8)}`,
                data: {
                    userId: session.userId,
                    lastMessageAt: session.lastMessageAt,
                },
                createdAt: session.createdAt,
            })

            // 获取该会话的统计（通过 messages 表关联）
            const ragCount = await db.select({ id: rags.id })
                .from(rags)
                .innerJoin(messages, eq(rags.messageId, messages.id))
                .where(eq(messages.sessionId, session.id))
            const trainCount = await db.select({ id: trains.id })
                .from(trains)
                .innerJoin(messages, eq(trains.messageId, messages.id))
                .where(eq(messages.sessionId, session.id))
            const modelCount = await db.select({ id: models.id })
                .from(models)
                .innerJoin(messages, eq(models.messageId, messages.id))
                .where(eq(messages.sessionId, session.id))
            const fileCount = await db.select({ id: files.id }).from(files).where(eq(files.sessionId, session.id))

            // 添加统计节点
            if (ragCount.length > 0) {
                const ragNodeId = `${session.id}-rags`
                nodes.push({
                    id: ragNodeId,
                    type: 'rag',
                    title: `${ragCount.length} 个知识库`,
                    data: { count: ragCount.length, isSummary: true },
                    createdAt: null,
                })
                edges.push({
                    id: `${session.id}-${ragNodeId}`,
                    source: session.id,
                    target: ragNodeId,
                    type: 'produces',
                    label: 'RAG',
                })
            }

            if (trainCount.length > 0) {
                const trainNodeId = `${session.id}-trains`
                nodes.push({
                    id: trainNodeId,
                    type: 'train',
                    title: `${trainCount.length} 次训练`,
                    data: { count: trainCount.length, isSummary: true },
                    createdAt: null,
                })
                edges.push({
                    id: `${session.id}-${trainNodeId}`,
                    source: session.id,
                    target: trainNodeId,
                    type: 'trains',
                    label: '训练',
                })
            }

            if (modelCount.length > 0) {
                const modelNodeId = `${session.id}-models`
                nodes.push({
                    id: modelNodeId,
                    type: 'model',
                    title: `${modelCount.length} 个模型`,
                    data: { count: modelCount.length, isSummary: true },
                    createdAt: null,
                })
                edges.push({
                    id: `${session.id}-${modelNodeId}`,
                    source: session.id,
                    target: modelNodeId,
                    type: 'registers',
                    label: '模型',
                })
            }

            if (fileCount.length > 0) {
                const fileNodeId = `${session.id}-files`
                nodes.push({
                    id: fileNodeId,
                    type: 'file',
                    title: `${fileCount.length} 个文件`,
                    data: { count: fileCount.length, isSummary: true },
                    createdAt: null,
                })
                edges.push({
                    id: `${session.id}-${fileNodeId}`,
                    source: session.id,
                    target: fileNodeId,
                    type: 'contains',
                    label: '文件',
                })
            }
        }

        return {
            code: 0,
            message: 'OK',
            data: { nodes, edges } as CanvasGraph,
        }
    }, {
        auth: true,
    })
