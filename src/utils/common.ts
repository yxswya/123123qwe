export function fileToArray(files: File[] | File): File[] {
    return Array.isArray(files) ? files : [files]
}
