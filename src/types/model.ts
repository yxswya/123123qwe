export interface ModelRecommendResponse {
    answer: {
        user_request: string
        analysis: {
            primary_task_type: string
            secondary_task_type: string
            language_requirement: string
            domain: string
            primary_keywords: string
            backup_keywords: string[]
            quality_constraints: {
                min_downloads: number
                min_likes: number
                recency_days: number
            }
        }
        recommendations: [
            {
                model_id: string
                why: string
                risk: string
                estimates: {
                    vram_gb: number
                    latency_ms: number
                }
                usage: string
            },
            {
                model_id: string
                why: string
                risk: string
                estimates: {
                    vram_gb: 16
                    latency_ms: 500
                }
                usage: string
            },
            {
                model_id: string
                why: string
                risk: string
                estimates: {
                    vram_gb: number
                    latency_ms: number
                }
                usage: string
            },
        ]
        notes: string
    }
    report: string
    confidence: number
    sources: string[]
    error: null
}
