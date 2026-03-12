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
