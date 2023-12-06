import type { Container } from "@azure/cosmos";
import { type IdAndPartition } from "../utils/utils-and-types";
import type { ZodObject, z } from "zod";
import { composePatchOps } from "./compose-patch";



export class Repository<T> {
    private schema?: ZodObject<any>
    private container?: Container
    private filter = (item: any) => item
    constructor(container?: Container) {
        if (container) this.container = container;
    }
    zodType = (schema: ZodObject<any>) => {
        this.schema = schema;
        this.filter = (item: any) => schema.parse(item) as z.infer<typeof schema>
        return this;
    }
    to = (container: Container) => {
        this.container = container;
        return this;
    }
    private ctn() {
        if (!this.container) throw new Error("container is not defined")
        return this.container
    }
    private patchOps = async (doc: IdAndPartition, patch: object) => {
        const { id, partition } = doc
        const patches = composePatchOps(patch, "")
        const { resource } = await this.ctn().item(id, partition).patch(patches)
        return this.filter(resource) as T
    }
    private expireOps = async (params: IdAndPartition, ttl: number) => {
        return await this.patchOps(params, { ttl })
    }
    private one = async (params: IdAndPartition) => {
        const { id, partition } = params
        const { resource } = await this.ctn().item(id, partition).read()
        return this.filter(resource) as T
    }
    private upsertOps = async (item: any) => {
        const { resource: insertedItem } = await this.ctn().items.upsert(item);
        return this.filter(insertedItem) as T
    }

    // pack the ops for the fluent interface 
    private opsCollection = {
        upsert: this.upsertOps,
        patch: this.patchOps,
        expire: this.expireOps,
        one: this.one,
    }
    ops = () => ({
        ...this.opsCollection,
    })
}