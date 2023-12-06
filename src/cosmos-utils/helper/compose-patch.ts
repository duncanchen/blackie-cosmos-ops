import type { PatchOperation } from "@azure/cosmos"

interface Snapshot {
    id?: string
    entity?: string
}

export function composePatchOps(snapshot: Snapshot, prefix: string) {
    const { id, entity, ...rest } = snapshot
    const ops: PatchOperation[] = Object.entries({
        ...rest,
        updatedAt: new Date(),
    }).map(([key, value]) => {
        return {
            op: "add",
            path: prefix ? `/${prefix}/${key}` : `/${key}`,
            value,
        }
    })
    return ops
}
