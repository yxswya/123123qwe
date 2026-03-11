export interface Option {
    value: string
    label: string
}

export interface ClarificationQuestion {
    id: string
    question: string
    question_type: string
    slot: string
    options: Option[]
}

/**
 * 操作类型枚举
 * @remarks 用于标识系统中发生的各种原子操作，常用于日志记录、权限控制或状态机
 */
export type ActionType
    = | 'AGENT_CREATE' // 创建智能体：新建一个AI智能体实例
        | 'AGENT_UPDATE' // 更新智能体：修改现有智能体的配置或属性
        | 'WORKFLOW_CREATE' // 创建工作流：定义一个新的自动化流程
        | 'WORKFLOW_RUN' // 运行工作流：执行已定义的工作流实例
        | 'RAG_BUILD_INDEX' // 构建RAG索引：为检索增强生成创建或重建向量索引
        | 'RAG_QUERY' // 查询RAG：向知识库发起检索查询
        | 'TRAIN_START' // 开始训练：启动模型或智能体的训练任务
        | 'DATA_CLEAN' // 数据清洗：对原始数据进行预处理、过滤或格式化
        | 'DATA_IMPORT' // 数据导入：将外部数据加载到系统中
        | 'ASK_MORE_INFO' // 请求更多信息：在交互过程中向用户索要补充数据

/**
 * 产物类型
 * @remarks 指系统在运行或构建过程中生成的可复用、可部署或可存储的输出
 */
export type ArtifactType
    = | 'vector_index' // 向量索引：用于RAG检索的向量数据库索引数据
        | 'model' // 模型文件：训练完成的机器学习模型权重或架构
        | 'endpoint' // API端点：已部署服务的访问URL或标识
        | 'report' // 报告文档：数据分析、训练日志或执行结果总结
        | 'package' // 软件包：打包好的代码、依赖或容器镜像
        | 'agent_app' // 智能体应用：可独立运行的智能体程序或配置
        | 'workflow' // 工作流配置：自动化流程的定义文件或元数据

/**
 * 流程阶段状态
 * @remarks 用于标记当前对话或任务流程所处的阶段，指导下一步操作
 */
export type StageType
    = | 'ready_for_agent_create' // 就绪状态：可以创建新的智能体（所有前置条件已满足）
        | 'ready_for_workflow_create' // 就绪状态：可以创建新的工作流
        | 'continue' // 继续状态：流程正常推进，无需额外输入即可执行下一步
        | 'need_more_info' // 等待状态：缺少必要信息，需要用户补充数据后才能继续
        | 'none' // 无阶段：初始状态或未定义阶段，通常表示流程尚未开始或已结束

export interface ApiResponseAnswer {
    stage: 'completeness'
    answer: {
        session_id: string
        next_action: string
        clarification_questions: ClarificationQuestion[]
        normalized_request: {
            ai_summary: string
        }
    }
}

export interface ApiResponseIntent {
    stage: 'intent'
    completeness: {
        session_id: string
    }
    workflow_hint: {
        reason: string
        stage: StageType
    }
    intent: {
        actions: Array<ActionType>
        artifacts: Array<ArtifactType>
        priority: 'low' | 'normal' | 'high' | 'urgent'
        confidence: number // 可信度：当前意图识别结果的信心分数
    }
}

export type ApiResponse = ApiResponseAnswer | ApiResponseIntent

// 类型守卫
export function hasAnswer(obj: any): obj is ApiResponseAnswer {
    return 'answer' in obj
}

// /api/exec/rag/build 请求参数
export interface RagBuildParams {
    rag_cfg: {
        backend: 'milvus' | 'pgvector' | 'file' // 向量存储后端：milvus、pgvector 或 file（本地文件）
        embedder: string // 向量化模型，如 sentence-transformers/all-MiniLM-L6-v2 或 BAAI/bge-large-zh-v1.5
        device?: string // 运行设备：cpu 或 cuda:0
        batch_size?: number // 批处理大小，默认 32
        dim?: number // 向量维度，如 384（MiniLM）、1024（bge-large）
        metric?: string // 相似度计算方式：cosine、ip（内积）、l2
        table?: string // PostgreSQL 表名（仅 pgvector 用）
        chunk?: { // 分块配置
            size: number // size（块大小）
            overlap: number // overlap（重叠）
            max_chunks: number // max_chunks（最大块数）
        }
    }
    dataset_ids: string[] // 数据集路径列表，支持目录或文件（.txt/.md/.csv/.log/.pdf/.docx）
    clean_id?: string // 可选的清洗任务 ID
}

// /api/exec/rag/build 返回结果
export interface RagBuildResponse {
    answer: {
        stage: 'rag_build'
        cached: boolean
        inputs: {
            rag_cfg: {
                backend: string
                embedder: string
            }
            dataset_ids: string[]
        }
        artifacts: {
            index_version: string
            index_uri: string
            manifest_uri: string
            embedder: string
            metric: 'cosine'
            dim: number
        }
        elapsed_ms: number
        stats: {
            dataset_summary: {
                total: number
                bytes: number
                sources: string[]
                fallback: []
                errors: []
            }
            chunk_distribution: {
                min: number
                max: number
                avg: number
                count: number
            }
            embedding_dim: number
            embedding_model: string
        }
        warnings: []
    }
    confidence: number
    sources: string[]
}

// /api/exec/rag/submit 返回结果
export interface RagBuildSyncResponse {
    job_id: string
}

// /api/exec/rag/status 返回结果（进行中）
export interface RagBuildStatusResponse {
    code: number
    message: string
    data: {
        answer: {
            id: string
            state: 'pending' | 'running' | 'succeeded' | 'failed'
            progress: number
            error: string | null
            result: Record<string, unknown>
            submitted_at: number
            started_at: number | null
            finished_at: number | null
            log_path: string
        }
    }
    trace_id: string
}

// /api/exec/rag/status 返回结果（完成）
export interface RagBuildStatusSuccessResponse {
    code: number
    message: string
    data: {
        answer: {
            id: string
            state: 'succeeded'
            progress: 1.0
            error: null
            result: RagBuildResponse['answer']
            submitted_at: number
            started_at: number
            finished_at: number
            log_path: string
        }
    }
    trace_id: string
}

// /api/exec/rag/answer
export interface RagAnswerResponse {
    answer: {
        text: string
        citations: Array<{
            rank: number // 等级
            score: number // 可信度
            text: string // 文本
            source: string // 资源路径
            span: number[]
        }>
        index_version: string
        mode: 'hybrid'
    }
    confidence: number
    sources: []
    error: null
}

export interface Success<T> {
    code: number
    message: string
    data: T
}
