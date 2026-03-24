import type { ModelListResponse, ModelPredictResponse } from '../types/governance'
import { eq } from 'drizzle-orm'
import Elysia, { t } from 'elysia'
import { db } from '../db'
import { models } from '../db/schema'
import { AuthService } from '../services/auth'

export const modelRoutes = new Elysia({ prefix: '/model' })
    .use(AuthService)
    // 获取已注册的模型列表
    .get('/list', async () => {
        const data = await fetch(`${process.env.LLM_SERVER}/exec/train/model/list`)
            .then(res => res.json())
            .then(data => data as ModelListResponse)

        return data
    }, {
        auth: true,
    })
    // 获取本地数据库中的模型列表
    .get('/local/:sessionId', async ({ params: { sessionId } }) => {
        const modelList = await db.select()
            .from(models)
            .where(eq(models.sessionId, sessionId))

        return {
            code: 0,
            message: 'OK',
            data: modelList,
        }
    }, {
        params: t.Object({
            sessionId: t.String(),
        }),
        auth: true,
    })
    // 获取所有模型列表
    .get('/all', async () => {
        const modelList = await db.select()
            .from(models)
            .orderBy(models.createdAt)

        return {
            code: 0,
            message: 'OK',
            data: modelList,
        }
    }, {
        auth: true,
    })
    // 使用模型对话
    .post('/predict', async ({ body }) => {
        const data = await fetch(`${process.env.LLM_SERVER}/exec/train/model/predict`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        })
            .then(res => res.json())
            .then(data => data as ModelPredictResponse)

        return data
    }, {
        body: t.Object({
            model_id: t.String(),
            prompt: t.String(),
            max_new_tokens: t.Optional(t.Number()),
        }),
        auth: true,
    })
    .get('/recommend', async () => {
        return {
            answer: {
                user_request: '用户希望构建一个用于企业内部业务流程的智能体，主要功能是供内部员工进行日常检索和查看，并明确将"上线最快"作为首要目标。用户当前提及"训练模型"，表明项目已进入模型构建阶段，但具体的业务领域、数据类型和性能指标仍未明确。',
                analysis: {
                    primary_task_type: 'other',
                    secondary_task_type: 'retrieval-augmented-generation',
                    language_requirement: 'zh',
                    domain: '通用',
                    primary_keywords: 'RAG',
                    backup_keywords: [
                        'retrieval',
                        'chat',
                        'text-generation',
                    ],
                    quality_constraints: {
                        min_downloads: 50,
                        min_likes: 5,
                        recency_days: 720,
                    },
                },
                recommendations: [
                    {
                        model_id: 'LiquidAI/LFM2-1.2B-RAG',
                        why: 'RAG专用、下载量高、生态好、Apache-2.0许可、参数小部署快',
                        risk: '模型较新，社区验证案例可能有限；非中文原生，需评估中文表现',
                        estimates: {
                            vram_gb: 4,
                            latency_ms: 150,
                        },
                        usage: '使用transformers库加载，结合LangChain等框架快速搭建RAG流程。',
                    },
                    {
                        model_id: 'AITeamVN/GRPO-VI-Qwen2-7B-RAG',
                        why: '针对越南语和中文优化、Apache-2.0许可、点赞数高',
                        risk: '参数较大（约7B），对部署资源要求更高，可能影响上线速度',
                        estimates: {
                            vram_gb: 16,
                            latency_ms: 500,
                        },
                        usage: '适合对中文支持有明确要求且资源充足的场景，需注意推理速度。',
                    },
                    {
                        model_id: 'LiquidAI/LFM2-1.2B-RAG-GGUF',
                        why: 'GGUF格式、CPU友好、内存占用低、部署灵活',
                        risk: 'GGUF格式通常用于本地推理，若需云端API服务则需转换',
                        estimates: {
                            vram_gb: 2,
                            latency_ms: 300,
                        },
                        usage: '使用llama.cpp等工具在资源受限环境（如CPU服务器）快速部署。',
                    },
                ],
                notes: '整体建议：优先推荐LFM2-1.2B-RAG，因其专为RAG设计、参数小、许可友好，最符合"上线最快"目标。AITeamVN系列模型中文支持更好但体积大。所有候选模型均未明确标注训练数据，需注意企业内部数据安全与合规性。许可方面，LiquidAI模型为"other"需仔细核查，AITeamVN模型为Apache-2.0更宽松。若追求极致速度，可考虑量化或使用更小的嵌入模型配合轻量生成模型。',
            },
            report: '模型推荐报告\n\n- 用户需求: 用户希望构建一个用于企业内部业务流程的智能体，主要功能是供内部员工进行日常检索和查看，并明确将"上线最快"作为首要目标。用户当前提及"训练模型"，表明项目已进入模型构建阶段，但具体的业务领域、数据类型和性能指标仍未明确。\n- 任务类型: other\n- 语言: zh\n- 领域: 通用\n- 关键词: RAG\n\n推荐模型（排序已综合热度/更新/匹配/许可/资源）\n1. LiquidAI/LFM2-1.2B-RAG\n   - 推荐理由: RAG专用、下载量高、生态好、Apache-2.0许可、参数小部署快\n   - 风险提示: 模型较新，社区验证案例可能有限；非中文原生，需评估中文表现\n   - 链接: https://huggingface.co/LiquidAI/LFM2-1.2B-RAG\n2. AITeamVN/GRPO-VI-Qwen2-7B-RAG\n   - 推荐理由: 针对越南语和中文优化、Apache-2.0许可、点赞数高\n   - 风险提示: 参数较大（约7B），对部署资源要求更高，可能影响上线速度\n   - 链接: https://huggingface.co/AITeamVN/GRPO-VI-Qwen2-7B-RAG\n3. LiquidAI/LFM2-1.2B-RAG-GGUF\n   - 推荐理由: GGUF格式、CPU友好、内存占用低、部署灵活\n   - 风险提示: GGUF格式通常用于本地推理，若需云端API服务则需转换\n   - 链接: https://huggingface.co/LiquidAI/LFM2-1.2B-RAG-GGUF\n\n建议\n整体建议：优先推荐LFM2-1.2B-RAG，因其专为RAG设计、参数小、许可友好，最符合"上线最快"目标。AITeamVN系列模型中文支持更好但体积大。所有候选模型均未明确标注训练数据，需注意企业内部数据安全与合规性。许可方面，LiquidAI模型为"other"需仔细核查，AITeamVN模型为Apache-2.0更宽松。若追求极致速度，可考虑量化或使用更小的嵌入模型配合轻量生成模型。\n\n备选模型（可进一步评估）\n- luffycodes/nash-vicuna-13b-v1dot5-ep2-w-rag-w-simple (text-generation)  下载:800  赞:2\n- ragib01/Qwen3-4B-customer-support (text-generation)  下载:424  赞:1\n- AITeamVN/Vi-Qwen2-7B-RAG (text-generation)  下载:103  赞:23\n- AITeamVN/Vi-Qwen2-1.5B-RAG (text-generation)  下载:46  赞:4\n- mradermacher/Mixtral_13B_Chat_RAG-Reader-GGUF (-)  下载:215  赞:0\n- Mungert/LFM2-1.2B-RAG-GGUF (text-generation)  下载:417  赞:1\n- OrionStarAI/Orion-14B-Chat-RAG (text-generation)  下载:9  赞:32\n- Anotos/LFM2-1.2b-RAG-MLX-4bit (text-generation)  下载:201  赞:1\n- h2oai/h2ogpt-gm-7b-mistral-chat-sft-dpo-rag-v1 (text-generation)  下载:10  赞:5\n- ricepaper/vi-gemma-2b-RAG (text-generation)  下载:7  赞:13',
            confidence: 0.9500000000000001,
            sources: [
                'https://huggingface.co/luffycodes/nash-vicuna-13b-v1dot5-ep2-w-rag-w-simple',
                'https://huggingface.co/ragib01/Qwen3-4B-customer-support',
                'https://huggingface.co/AITeamVN/GRPO-VI-Qwen2-7B-RAG',
                'https://huggingface.co/AITeamVN/Vi-Qwen2-7B-RAG',
                'https://huggingface.co/LiquidAI/LFM2-1.2B-RAG-GGUF',
                'https://huggingface.co/LiquidAI/LFM2-1.2B-RAG',
                'https://huggingface.co/AITeamVN/Vi-Qwen2-1.5B-RAG',
                'https://huggingface.co/mradermacher/Mixtral_13B_Chat_RAG-Reader-GGUF',
            ],
            error: null,
        }
    })
