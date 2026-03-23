// 注册模型信息
export interface RegisteredModel {
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

// 模型列表响应
export interface ModelListResponse {
    code: number
    message: string
    data: {
        answer: {
            models: RegisteredModel[]
        }
        confidence: number
        sources: string[]
        error: string | null
    }
    trace_id: string
}

// 注册模型请求
export interface RegisterModelRequest {
    model_uri: string
    task: string
    model_type: string
    note?: string
}

// 注册模型响应
export interface RegisterModelResponse {
    code: number
    message: string
    data: {
        answer: RegisteredModel & {
            usage_hint?: {
                env: Record<string, string>
                cli_example: string
            }
        }
        confidence: number
        sources: string[]
        error: string | null
    }
    trace_id: string
}

// 模型对话请求
export interface ModelPredictRequest {
    model_id: string
    prompt: string
    max_new_tokens?: number
}

// 模型对话响应
export interface ModelPredictResponse {
    code: number
    message: string
    data: {
        answer: {
            model_uri: string
            task: string
            prompt: string
            text: string
            max_new_tokens: number
            temperature: number
        }
        confidence: number
        sources: string[]
        error: string | null
    }
    trace_id: string
}

export interface GovernanceRagResponse {
    answer: {
        governance: [
            {
                dataset_id: string
                cleaned_dataset_path: string
                cleaned_dir: string
                reports: {
                    ingest: object
                    cleaning: object
                    compliance: object
                    valuation: object
                }
                summary: {
                    name: string
                    task_type: 'rag' | 'train'
                    risk_level: null
                    quality_score: null
                    pii_count: number
                }
                storage: {
                    raw_dir: string
                    cleaned_dir: string
                    quality_report: string
                    manifest: string
                    samples_file: string
                    standard_samples_file: string
                }
            },
        ]
        rag: {
            run_id: string
            stage: string
            cached: false
            inputs: {
                rag_cfg: {
                    backend: 'pgvector'
                    embedder: string
                    dim: number
                    metric: string
                    chunk: {
                        size: number
                        overlap: number
                    }
                }
                dataset_ids: string[]
                clean_id: null
            }
            artifacts: {
                index_version: string
                index_uri: string
                manifest_uri: string
                embedder: string
                metric: string
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
    }
    confidence: number
    sources: string[]
    error: null

}

export interface GovernanceResponse {
    success: [
        {
            file: string
            file_name: string
            result: {
                status: string
                format: string
                total_documents: number
                valid_documents: number
                removed_documents: number
                documents: [
                    {
                        id: string
                        text: string
                        metadata: {
                            source: string
                            paragraph: number
                            format: string
                        }
                    },
                ]
                metadata: object
                task_type: string
            }
        },
    ]
    failed: [
        {
            file: string
            file_name: string
            error: string
        },
    ]
    summary: {
        total: number
        success_count: number
        failed_count: number
        total_time: number
        avg_time_per_file: number
    }
    filename_mapping: Record<string, string>
}

export interface GovernanceTrainResponse {
    answer: {
        governance: object[]
        rag: {
            run_id: string
            stage: string
            cached: boolean
            inputs: object
            artifacts: object
            elapsed_ms: number
            stats: object
            warnings: []
        }
        train: {
            run_id: string
            stage: 'train'
            cached: boolean
            inputs: {
                train_cfg: {
                    method: string
                    base_model: string
                    epochs: number
                    lr: number
                    batch_size: number
                    max_seq_len: number
                    dry_run: boolean
                    dataset_uri: string
                }
            }
            artifacts: {
                ckpt_id: string
                ckpt_uri: string
                mlflow_run: string
            }
            metrics: {
                eval_accuracy_estimated: number
            }
            early_stop: boolean
            elapsed_ms: number
            registered_model?: {
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
        }
    }
    confidence: number
    sources: string[]
    error: string | null
}
