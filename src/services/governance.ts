import type { NewRag, SelectSession } from '../db/schema'
import type { GovernanceRagResponse, GovernanceTrainResponse } from '../types/governance'
import type { SessionService } from './session'
import { FileService } from './file'
import { appendRag } from './session'

/**
 * RAG 配置
 */
export interface RagConfig {
    backend: string
    embedder: string
    dim?: number
    metric?: string
    chunk: {
        size: number
        overlap: number
    }
}

/**
 * 数据集文件元信息
 */
export interface DatasetFileMeta {
    name: string
    description: string
    task_type: string
    intended_use?: string
}

/**
 * 治理服务 - 处理数据治理、RAG 构建、模型训练的共享逻辑
 */
export class GovernanceService {
    private readonly llmServer: string

    constructor() {
        this.llmServer = process.env.LLM_SERVER || 'http://localhost:8000'
    }

    /**
     * 构建 FormData 用于治理请求
     */
    buildFormData(files: File[], fileMetas: DatasetFileMeta[], ragCfg: RagConfig, trainCfg?: any): FormData {
        const formData = new FormData()

        for (const file of files) {
            formData.append('dataset_files', file)
        }

        const body: Record<string, any> = {
            rag_cfg: ragCfg,
            dataset_file_metas: fileMetas,
        }

        if (trainCfg) {
            body.train_cfg = trainCfg
            body.extra_dataset_ids = ['datasets/other_docs']
        }

        formData.append('body', JSON.stringify(body))

        return formData
    }

    /**
     * 保存治理 JSONL 文件
     */
    async saveGovernanceFile(
        governanceData: object[],
        sessionId: string,
        messageId: string,
    ): Promise<void> {
        const governanceJsonl = governanceData.map(item => JSON.stringify(item)).join('\n')
        const fileName = `governance-${Date.now()}.jsonl`

        const fileService = new FileService(sessionId)
        await fileService.saveFile(governanceJsonl, fileName, messageId)
    }

    /**
     * 调用 RAG 构建接口
     */
    async buildRagFromFiles(formData: FormData): Promise<GovernanceRagResponse> {
        const response = await fetch(`${this.llmServer}/data/governance/rag/build/from-files`, {
            method: 'POST',
            body: formData,
        })

        const result = await response.json()
        return result.data as GovernanceRagResponse
    }

    /**
     * 调用 RAG + 训练接口
     */
    async trainFromFiles(formData: FormData): Promise<GovernanceTrainResponse> {
        const response = await fetch(`${this.llmServer}/data/governance/rag/train/from-files`, {
            method: 'POST',
            body: formData,
        })

        const result = await response.json()
        console.log('train response:', result)
        return result.data as GovernanceTrainResponse
    }

    /**
     * 存储纯 RAG 结果（用于 /rag/:sessionId）
     */
    async storeRagResult(
        data: GovernanceRagResponse,
        session: SelectSession,
        messageId: string,
        title: string,
        sessionId: string,
    ): Promise<void> {
        // 保存治理文件
        await this.saveGovernanceFile(data.answer.governance, sessionId, messageId)

        // 存储 RAG 记录（不再需要 sessionId，通过 messageId 关联）
        const newRag: NewRag = {
            indexVersion: data.answer.rag.artifacts.index_version,
            content: JSON.stringify(data),
            title,
            messageId,
        }

        await appendRag(session, newRag)
    }

    /**
     * 存储训练结果中的 RAG 数据（用于 /train/:sessionId）
     */
    async storeTrainRagResult(
        data: GovernanceTrainResponse,
        session: SessionService,
        messageId: string,
        title: string,
        sessionId: string,
    ): Promise<NewRag | null> {
        // 如果有 RAG 数据，保存治理文件和 RAG 记录
        if (!data.answer.rag) {
            return null
        }

        // 保存治理文件
        if (data.answer.governance && data.answer.governance.length > 0) {
            await this.saveGovernanceFile(data.answer.governance, sessionId, messageId)
        }

        // 存储 RAG 记录（不再需要 sessionId，通过 messageId 关联）
        const newRag: NewRag = {
            indexVersion: data.answer.rag.artifacts.index_version,
            content: JSON.stringify({
                rag: data.answer.rag,
                governance: data.answer.governance,
            }),
            title,
            messageId,
        }

        // 注意：这里不调用 session.appendRag，因为消息已经被训练流程使用
        // 而是直接插入到 rags 表中
        return newRag
    }

    /**
     * 注册模型
     */
    async registerModel(modelUri: string, note: string): Promise<{
        success: boolean
        data?: {
            id: string
            model_uri: string
            task: string
            model_type: string
            note: string
            exists_local: boolean
            file_size: number
            mtime: string
            created_at: string
        }
        error?: string
    }> {
        try {
            const response = await fetch(`${this.llmServer}/exec/train/model/use`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model_uri: modelUri,
                    task: 'chat',
                    model_type: 'causal-lm',
                    note,
                }),
            })

            const result = await response.json()
            console.log('register response:', result)

            if (result.code === 0 && result.data?.answer) {
                return {
                    success: true,
                    data: result.data.answer,
                }
            }

            return {
                success: false,
                error: result.message || '注册失败',
            }
        }
        catch (err) {
            console.error('注册模型失败:', err)
            return {
                success: false,
                error: err instanceof Error ? err.message : '未知错误',
            }
        }
    }
}

// 单例导出
export const governanceService = new GovernanceService()
