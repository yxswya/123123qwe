import Elysia, { t } from 'elysia'
import { AuthService } from '../services/auth'

export const trainRoutes = new Elysia({ prefix: '/train' })
    .use(AuthService)
    .post('/start', async ({ body }) => {
        const files = body.files as File[] | File
        const fileArray = Array.isArray(files) ? files : [files]

        const formData = new FormData()
        fileArray.forEach((el) => {
            formData.append('dataset_files', el)
        })
        formData.append('body', JSON.stringify({
            dataset_file_metas: [
                {
                    name: 'test_dataset',
                    task_type: 'rag',
                },
            ],
            rag_cfg: {
                embedder: 'sentence-transformers/all-MiniLM-L6-v2', // 已是最小嵌入模型之一（384维），可保持或换为更小的 paraphrase-MiniLM-L3-v2
                dim: 384,
                chunk: {
                    size: 128, // 原400 → 128（减小块大小，降低计算）
                    overlap: 16, // 原50 → 16（减小重叠，减少冗余）
                    max_chunks: 10, // 原100 → 10（限制最大块数，避免处理过多）
                },
                backend: 'milvus', // 保持不变，也可改用内存型（如 'faiss' 或 'memory' 但需后端支持）
                batch_size: 1, // 原16 → 1（最小批次，减少显存/内存占用）
            },
            train_cfg: {
                base_model: 'Qwen/Qwen2.5-0.5B', // 已是最小模型之一（0.5B），如需更低可换为 bert-tiny 等
                method: 'lora',
                epochs: 1, // 已经最小
                max_steps: 1, // 原10 → 1（只训练一步，快速测试）
                lr: 2e-4, // 学习率不变（过小可能导致不收敛）
                batch_size: 1, // 原4 → 1（最小训练批次）
                lora_r: 1, // 原4 → 1（最小秩，参数最少）
                lora_alpha: 1, // 原8 → 1（与 r 匹配）
                max_seq_len: 128, // 原512 → 128（减小序列长度，节省显存）
                dry_run: false, // 保持 false（如需不实际训练可设为 true）
            },
            extra_dataset_ids: [],
        }))
        const result = await fetch(`${process.env.LLM_SERVER}/data/governance/rag/train/from-files`, {
            method: 'POST',
            body: formData,
        }).then(res => res.json())

        return result
    }, {
        body: t.Object({
            files: t.Files({
                minItems: 1,
            }),
        }),
    })
    .post('/evaluate', async () => {
        return fetch(`${process.env.LLM_SERVER}/exec/train/evaluate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ train_cfg: {
                dataset_uri: 'file://indices\\idx_2e8dc59f',
                base_model: 'Qwen/Qwen2-0.5B',
                method: 'sft',
            } }),
        }).then(res => res.json())
    })
    .post('/chat/:ckpt_id', async ({ params: { ckpt_id }, body }) => {
        const result = await fetch(`${process.env.LLM_SERVER}/chat/model/start`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model_id: ckpt_id,
                system_prompt: '你是一个智能客服助手',
                max_history: 10,
            }),
        }).then(res => res.json())

        return result.data as any
    }, {
        params: t.Object({
            ckpt_id: t.String(),
        }),
        body: t.Object({
            text: t.String({}),
        }),
    })
