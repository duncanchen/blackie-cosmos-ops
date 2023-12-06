import type { FeedResponse } from "@azure/cosmos"
import { blockInternalAttrs } from "../utils/utils-and-types"

export class Extractor {
    constructor(private readonly resp: FeedResponse<any>) {}

    all<T extends object>() {
        const { resources: results } = this.resp
        return results
            ? (results.map((result) => blockInternalAttrs(result)) as T[])
            : [] as T[]
    }

    one<T extends object>() {
        const all = this.all<T>()
        return all && all.length > 0 ? (blockInternalAttrs(all[0]) as T) : null
    }
}
