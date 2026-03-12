import Elysia, { t } from 'elysia'
import { authPlugin } from '../plugins/auth'

export const trainRoutes = new Elysia({ prefix: '/train' })
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
            .post('/start', async ({ body }) => {
                const files = body.files as File[] | File

                const fileArray = Array.isArray(files) ? files : [files]
                console.log('/api/exec/train/start')

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
                        embedder: 'sentence-transformers/all-MiniLM-L6-v2',
                        dim: 384,
                        chunk: {
                            size: 400,
                            overlap: 50,
                            max_chunks: 100,
                        },
                        backend: 'milvus',
                        batch_size: 16,
                    },
                    train_cfg: {
                        base_model: 'Qwen/Qwen2.5-0.5B',
                        method: 'lora',
                        epochs: 1,
                        max_steps: 10,
                        lr: 2e-4,
                        batch_size: 4,
                        lora_r: 4,
                        lora_alpha: 8,
                        max_seq_len: 512,
                        dry_run: false,
                    },
                    extra_dataset_ids: [],
                }))
                const result = await fetch('http://localhost:8002/api/data/governance/rag/train/from-files', {
                    method: 'POST',
                    body: formData,
                }).then(res => res.json())

                console.log('result', result)
                return result

                // console.log('/api/exec/train/start')
                // const result = await fetch('http://localhost:8002/api/exec/train/start', {
                //     method: 'POST',
                //     headers: { 'Content-Type': 'application/json' },
                //     body: JSON.stringify({
                //         train_cfg: {
                //             base_model: body.model_id,
                //             dataset_uri: 'governance://ds_a1b2c3d4e5f6',
                //         },
                //         dry_run: false,
                //     }),
                // }).then(res => res.json())

                // console.log('result', result)
                // return result
            }, {
                body: t.Object({
                    files: t.Files({
                        minItems: 1,
                    }),
                }),
            }))
