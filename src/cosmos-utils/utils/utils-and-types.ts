
export const asDateStamp = (date: Date) => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0'); // January is 0!
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function maskInternal(obj: any) {
    if (!obj) return obj
    const { _rid, _self, _etag, _attachments, _ts, ...rest } = obj
    return rest
}

export function blockInternalAttrs(obj: object | null | undefined) {
    if (!obj) return obj 
    return Array.isArray(obj)
        ? obj.map((o) => maskInternal(o))
        : maskInternal(obj) 
}

export type IdAndPartition = { id: string, partition: string | undefined }