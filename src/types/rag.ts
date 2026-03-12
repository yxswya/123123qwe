export interface RagBuildResponse {
    answer: {
        run_id: string
        stage: string
        cached: boolean
        inputs: {
            rag_cfg: {
                backend: 'file'
                embedder: string
                dim: number
            }
            dataset_ids: string[]
            clean_id: null
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
                fallback: [

                ]
                errors: [

                ]
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
        warnings: [

        ]
    }
    confidence: number
    sources: string[]
    error: null
}

export interface RagAnswerResponse {
    answer: {
        text: string
        citations: [
            {
                rank: number
                score: number
                text: string
                source: string
                span: number[]
            },
        ]
        index_version: string
        mode: 'hybrid'
    }
    confidence: 0
    sources: []
    error: null
}
